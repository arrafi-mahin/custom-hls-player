"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { MdOutlineForward10, MdOutlineReplay10 } from "react-icons/md";

interface HLSPlayerProps {
  src: string;
  title?: string;
  subtitle?: string;
  className?: string;
  xhrSetup?: (xhr: XMLHttpRequest, url: string) => void;
}

export default function HLSPlayer({
  src,
  title,
  subtitle,
  className = "",
  xhrSetup,
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bufferingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<
    Array<{ start: number; end: number }>
  >([]);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<
    Array<{ level: number; height: number; bitrate: number; label: string }>
  >([]);
  const [currentQualityLevel, setCurrentQualityLevel] = useState<number>(-1);
  const [isManualQuality, setIsManualQuality] = useState(false);
  const isManualQualityRef = useRef(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        enableSoftwareAES: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        // ABR configuration to prefer higher quality
        abrEwmaDefaultEstimate: 5000000, // Higher initial bandwidth estimate (5 Mbps)
        abrBandWidthFactor: 0.95, // Use 95% of available bandwidth
        abrBandWidthUpFactor: 0.7, // More aggressive about switching up
        abrMaxWithRealBitrate: false, // Don't limit based on real bitrate
        maxBufferLength: 30, // Allow longer buffering for higher quality
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        startLevel: -1, // Auto-select best level initially
        // xhrSetup for custom headers on video chunk requests
        xhrSetup: xhrSetup,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setError(null);

        // Set to highest quality level available and populate quality levels
        if (hls && hls.levels && hls.levels.length > 0) {
          const highestLevel = hls.levels.length - 1;
          hls.currentLevel = highestLevel;
          setCurrentQualityLevel(highestLevel);

          // Create quality levels array for dropdown (keep original indices)
          const levels = hls.levels.map((level, index) => ({
            level: index,
            height: level.height || 0,
            bitrate: level.bitrate || 0,
            label: level.height ? `${level.height}p` : `Level ${index}`,
          }));

          // Sort by height descending for display, but keep original level indices
          const sortedLevels = [...levels].sort((a, b) => b.height - a.height);
          setQualityLevels(sortedLevels);

          console.log(
            `Set to highest quality level: ${highestLevel} (${
              hls.levels[highestLevel].height
            }p, ${Math.round(hls.levels[highestLevel].bitrate / 1000)}kbps)`
          );
        }
      });

      // Monitor level switches
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        if (hls && hls.levels && hls.levels.length > 0) {
          const currentLevel = data.level;
          setCurrentQualityLevel(currentLevel);

          // Only auto-upgrade if user hasn't manually selected a quality
          if (!isManualQualityRef.current) {
            const highestLevel = hls.levels.length - 1;

            // If we're not at the highest level and bandwidth allows, try to switch up
            if (
              currentLevel < highestLevel &&
              hls.bandwidthEstimate > hls.levels[highestLevel].bitrate * 1.2
            ) {
              setTimeout(() => {
                if (
                  hls &&
                  hls.currentLevel < highestLevel &&
                  !isManualQualityRef.current
                ) {
                  hls.currentLevel = highestLevel;
                  console.log(
                    `Upgraded to highest quality level: ${highestLevel}`
                  );
                }
              }, 2000); // Wait 2 seconds before upgrading
            }
          }
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("Fatal network error encountered, try to recover");
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("Fatal media error encountered, try to recover");
              hls?.recoverMediaError();
              break;
            default:
              console.error("Fatal error, cannot recover");
              hls?.destroy();
              setError("Failed to load video");
              setIsLoading(false);
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      // Note: Native HLS doesn't support xhrSetup, headers must be set via CORS or other means
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        setError(null);
      });
    } else {
      setError("HLS is not supported in this browser");
      setIsLoading(false);
    }

    hlsRef.current = hls;

    // Video event listeners
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Update buffered ranges
      updateBufferedRanges();
    };
    const handleDurationChange = () => {
      setDuration(video.duration);
      updateBufferedRanges();
    };

    const updateBufferedRanges = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const ranges: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < video.buffered.length; i++) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i),
          });
        }
        setBufferedRanges(ranges);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleWaiting = () => {
      // Only show buffering if video is actually playing and waiting for data
      if (!video.paused && video.readyState < 3) {
        // Clear any existing timeout
        if (bufferingTimeoutRef.current) {
          clearTimeout(bufferingTimeoutRef.current);
        }
        // Small delay to prevent flickering on brief stalls
        bufferingTimeoutRef.current = setTimeout(() => {
          if (!video.paused && video.readyState < 3) {
            setIsBuffering(true);
          }
        }, 300);
      }
    };
    const handleCanPlay = () => {
      // Video can play, buffering stopped
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      setIsBuffering(false);
    };
    const handlePlaying = () => {
      // Video started playing, buffering stopped
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      setIsBuffering(false);
    };
    const handleSeeking = () => {
      // Show buffering when seeking
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
      }
      setIsBuffering(true);
    };
    const handleSeeked = () => {
      // Hide buffering when seek is complete
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      // Check if video can play
      if (video.readyState >= 3) {
        setIsBuffering(false);
      }
    };
    const handleStalled = () => {
      // Video stalled - show buffering if playing
      if (!video.paused) {
        setIsBuffering(true);
      }
    };
    const handleLoadedData = () => {
      // Data loaded, hide buffering
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      setIsBuffering(false);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("volumechange", handleVolumeChange);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("canplaythrough", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("progress", updateBufferedRanges);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("volumechange", handleVolumeChange);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("canplaythrough", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("progress", updateBufferedRanges);

      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }

      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  // Show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    }
  }, [isPlaying]);

  // Mouse movement detection for showing/hiding controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const showControlsWithTimeout = () => {
      setShowControls(true);

      // Clear existing timeout
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }

      // Hide controls after 3 seconds of no movement (only if playing)
      hideControlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const handleMouseMove = () => {
      showControlsWithTimeout();
    };

    const handleMouseLeave = () => {
      if (isPlaying) {
        setShowControls(false);
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    // Initial timeout (only if playing)
    if (isPlaying) {
      showControlsWithTimeout();
    }

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // Fullscreen change detection
  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // Check if we're on iOS (Safari)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const handleFullscreenChange = () => {
      const isFullscreenActive = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFullscreenActive);
    };

    // For iOS, listen to video element events
    if (isIOS) {
      const handleVideoBeginFullscreen = () => setIsFullscreen(true);
      const handleVideoEndFullscreen = () => setIsFullscreen(false);

      // iOS specific events
      video.addEventListener(
        "webkitbeginfullscreen",
        handleVideoBeginFullscreen
      );
      video.addEventListener("webkitendfullscreen", handleVideoEndFullscreen);

      // Also listen to standard events as fallback
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );

      return () => {
        video.removeEventListener(
          "webkitbeginfullscreen",
          handleVideoBeginFullscreen
        );
        video.removeEventListener(
          "webkitendfullscreen",
          handleVideoEndFullscreen
        );
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "webkitfullscreenchange",
          handleFullscreenChange
        );
      };
    } else {
      // Standard fullscreen API for other browsers
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.addEventListener("mozfullscreenchange", handleFullscreenChange);
      document.addEventListener("MSFullscreenChange", handleFullscreenChange);

      return () => {
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "webkitfullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "mozfullscreenchange",
          handleFullscreenChange
        );
        document.removeEventListener(
          "MSFullscreenChange",
          handleFullscreenChange
        );
      };
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Prevent default behavior for our shortcuts
      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(video.currentTime - 10, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(
            video.currentTime + 10,
            video.duration || 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          // Increase volume by 5%
          const currentVol = video.volume;
          const newVolumeUp = Math.min(currentVol + 0.05, 1);
          video.volume = newVolumeUp;
          setVolume(newVolumeUp);
          setIsMuted(newVolumeUp === 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          // Decrease volume by 5%
          const currentVolDown = video.volume;
          const newVolumeDown = Math.max(currentVolDown - 0.05, 0);
          video.volume = newVolumeDown;
          setVolume(newVolumeDown);
          setIsMuted(newVolumeDown === 0);
          break;
        case "Enter":
          // Only enter fullscreen if not already in fullscreen
          if (!isFullscreen) {
            e.preventDefault();
            const container = containerRef.current;
            const video = videoRef.current;
            if (container && video) {
              // Check if we're on iOS (Safari)
              const isIOS =
                /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" &&
                  navigator.maxTouchPoints > 1);

              // iOS Safari requires webkitEnterFullscreen on the video element
              if (isIOS && (video as any).webkitEnterFullscreen) {
                (video as any).webkitEnterFullscreen();
              } else if (container.requestFullscreen) {
                container.requestFullscreen();
              } else if ((container as any).webkitRequestFullscreen) {
                (container as any).webkitRequestFullscreen();
              } else if ((container as any).mozRequestFullScreen) {
                (container as any).mozRequestFullScreen();
              } else if ((container as any).msRequestFullscreen) {
                (container as any).msRequestFullscreen();
              }
            }
          }
          break;
        case "Escape":
        case "Esc":
          // Only exit fullscreen if in fullscreen
          if (isFullscreen) {
            e.preventDefault();
            if (document.exitFullscreen) {
              document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            } else if ((document as any).mozCancelFullScreen) {
              (document as any).mozCancelFullScreen();
            } else if ((document as any).msExitFullscreen) {
              (document as any).msExitFullscreen();
            }
          }
          break;
      }
    };

    // Add event listener to container or window
    container.addEventListener("keydown", handleKeyDown);
    // Also listen on window for when container is focused
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  // Screen sharing/recording detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Create a hidden canvas to detect frame capture attempts
    // Screen recording tools often try to capture frames from video elements
    const detectionCanvas: HTMLCanvasElement | null = (() => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        canvas.style.display = "none";
        canvas.style.position = "absolute";
        canvas.style.top = "-9999px";
        canvas.style.left = "-9999px";
        const context = canvas.getContext("2d", { willReadFrequently: true });

        // Monitor for attempts to read from canvas (indicates recording)
        if (context) {
          let readCount = 0;
          // Override getImageData to detect reads
          const originalGetImageData = context.getImageData.bind(context);
          context.getImageData = function (
            sx: number,
            sy: number,
            sw: number,
            sh: number
          ) {
            readCount++;
            // If someone is reading from our detection canvas frequently, they might be recording
            if (readCount > 2) {
              // Multiple reads detected - likely recording
              setIsScreenSharing(true);
              if (video) {
                video.pause();
              }
            }
            return originalGetImageData(sx, sy, sw, sh);
          };

          // Periodically draw video to canvas to detect if it's being captured
          const drawVideoToCanvas = () => {
            if (video && !video.paused && video.readyState >= 2) {
              try {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
              } catch (e) {
                // Video might not be ready
              }
            }
          };

          // Draw video frames to canvas periodically
          const drawInterval = setInterval(drawVideoToCanvas, 100);

          // Store interval for cleanup
          (canvas as any)._drawInterval = drawInterval;
        }
        return canvas;
      } catch (e) {
        // Canvas creation failed
        return null;
      }
    })();

    // Enhanced detection for screen sharing and recording
    const detectScreenSharing = () => {
      try {
        // Check if document is being captured (Chrome/Edge)
        if ((document as any).captured !== undefined) {
          if ((document as any).captured) return true;
        }

        // Check for Firefox
        if ((document as any).mozCaptured !== undefined) {
          if ((document as any).mozCaptured) return true;
        }

        // Check for Safari/WebKit
        if ((window as any).captured !== undefined) {
          if ((window as any).captured) return true;
        }

        // Check for active MediaStream tracks globally (screen recording often creates these)
        // Note: enumerateDevices is async and requires permission, so we check other ways

        // More aggressive: Check if video element has been captured
        // Screen recording tools often call captureStream() on video elements
        try {
          const videoWithCapture = video as any;
          // Try to detect if captureStream was called by checking for active tracks
          // This is a heuristic - if we can detect active capture streams
          if (videoWithCapture.captureStream) {
            // Some browsers expose active capture streams
            // We'll check this more aggressively below
          }
        } catch (e) {
          // Ignore
        }

        // Check for MediaStream tracks on the video element (indicates screen sharing/recording)
        if (video.srcObject) {
          const mediaStream = video.srcObject as MediaStream;
          if (mediaStream instanceof MediaStream) {
            const videoTracks = mediaStream.getVideoTracks();
            for (const track of videoTracks) {
              // Check if it's a screen capture track
              if (
                track.label &&
                (track.label.includes("screen") ||
                  track.label.includes("window") ||
                  track.label.includes("display") ||
                  track.label.includes("monitor"))
              ) {
                return true;
              }
            }
          }
        }

        // Detect if video element is being captured via captureStream API
        // This happens when screen recording software captures the video
        try {
          const videoWithCapture = video as any;
          if (
            videoWithCapture.captureStream &&
            typeof videoWithCapture.captureStream === "function"
          ) {
            // Try to detect if captureStream has been called and is active
            // We can't directly detect this, but we can monitor for suspicious patterns
          }
        } catch (e) {
          // captureStream might not be available or throw errors
        }

        // More aggressive detection: Monitor video element for capture attempts
        // Screen recording tools often access video properties or try to capture frames
        try {
          // Check if video is being accessed in suspicious ways
          // This is done by monitoring property access (if possible)
          // Note: Direct property access monitoring is limited, but we can check state
          // Check if video has been paused unexpectedly (some recording tools pause video)
          // This is handled elsewhere, but we note it here
        } catch (e) {
          // Monitoring might fail
        }

        // Check for canvas elements that might be capturing video frames
        // Screen recording tools often use canvas to capture frames
        const canvasElements = document.querySelectorAll("canvas");
        for (const canvas of canvasElements) {
          try {
            // Skip our own detection canvas
            if (canvas === detectionCanvas) continue;

            const context = canvas.getContext("2d");
            if (context) {
              const rect = canvas.getBoundingClientRect();
              const videoRect = video.getBoundingClientRect();

              // More lenient detection - check if canvas is near video
              const isOverlaying =
                rect.width > 0 &&
                rect.height > 0 &&
                Math.abs(rect.width - videoRect.width) < 100 &&
                Math.abs(rect.height - videoRect.height) < 100 &&
                Math.abs(rect.top - videoRect.top) < 100 &&
                Math.abs(rect.left - videoRect.left) < 100;

              if (isOverlaying) {
                // Canvas near video - likely being used for recording
                // Try to detect if canvas is actively capturing video frames
                try {
                  // If we can read from the canvas and it's near video,
                  // it's likely being used for recording
                  const imageData = context.getImageData(0, 0, 1, 1);
                  if (imageData && imageData.data) {
                    // Canvas is readable and near video - likely recording
                    return true;
                  }
                } catch (readError) {
                  // Canvas might be tainted, but still suspicious
                  // Return true as a precaution
                  return true;
                }
              }

              // Also check if canvas size matches video size exactly (very suspicious)
              if (
                Math.abs(rect.width - videoRect.width) < 5 &&
                Math.abs(rect.height - videoRect.height) < 5
              ) {
                // Canvas matches video size exactly - very likely recording
                return true;
              }
            }
          } catch (e) {
            // Canvas might be inaccessible, but continue checking
          }
        }

        // iOS-specific detection
        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        if (isIOS) {
          // On iOS, screen recording can be detected by checking video properties
          // When recording, the video might have different behavior
          // Check if video is in a state that suggests recording
          if ((video as any).webkitDisplayingFullscreen) {
            // Video is in fullscreen, which could be used for recording
          }

          // Check for AirPlay (which can be used for recording)
          if ((video as any).webkitCurrentPlaybackTargetIsWireless) {
            const isWireless = (
              video as any
            ).webkitCurrentPlaybackTargetIsWireless();
            if (isWireless) {
              // Video is being streamed wirelessly, might be recorded
            }
          }
        }

        // Check for suspicious iframe overlays (some recording tools use iframes)
        const iframes = document.querySelectorAll("iframe");
        for (const iframe of iframes) {
          try {
            const rect = iframe.getBoundingClientRect();
            const videoRect = video.getBoundingClientRect();

            // Check if iframe is overlaying video
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top <= videoRect.top &&
              rect.left <= videoRect.left &&
              rect.bottom >= videoRect.bottom &&
              rect.right >= videoRect.right
            ) {
              // Iframe overlaying video - might be used for recording
              // This is a heuristic
            }
          } catch (e) {
            // Cross-origin iframe, can't access
          }
        }

        return false;
      } catch (err) {
        return false;
      }
    };

    // Listen for capturedchange event (if supported)
    const handleCapturedChange = () => {
      const captured = detectScreenSharing();
      setIsScreenSharing(captured);

      if (captured && video) {
        video.pause();
      }
    };

    // Check immediately
    const initialCheck = detectScreenSharing();
    setIsScreenSharing(initialCheck);
    if (initialCheck && video) {
      video.pause();
    }

    // Set up event listeners for capture detection
    if ((document as any).addEventListener) {
      // Try to listen for capturedchange event (Chrome/Edge)
      try {
        (document as any).addEventListener(
          "capturedchange",
          handleCapturedChange
        );
      } catch (e) {
        // Event not supported
      }
    }

    // More aggressive periodic check when video is playing (every 200ms)
    // This helps detect recording that starts after playback begins
    const performDetectionCheck = () => {
      const captured = detectScreenSharing();
      setIsScreenSharing((prev) => {
        if (captured !== prev) {
          if (captured && video) {
            video.pause();
          }
          return captured;
        }
        return prev;
      });
    };

    // Monitor for dynamically added canvas elements (recording tools often add them)
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === "CANVAS") {
            const canvas = node as HTMLCanvasElement;
            // A canvas was added - check if it's suspicious immediately
            try {
              const context = canvas.getContext("2d");
              if (context) {
                const rect = canvas.getBoundingClientRect();
                const videoRect = video.getBoundingClientRect();

                // Check if canvas is overlaying video
                if (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  Math.abs(rect.width - videoRect.width) < 50 &&
                  Math.abs(rect.height - videoRect.height) < 50
                ) {
                  // Canvas overlaying video - likely recording
                  setIsScreenSharing(true);
                  if (video) {
                    video.pause();
                  }
                  return; // Exit early, we found it
                }
              }
            } catch (e) {
              // Canvas might be inaccessible, but still check
            }

            // Also run full detection check
            performDetectionCheck();
          }
        }
      }
    });

    // Observe the document body for canvas additions
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Check more frequently when video is playing
    const handleVideoPlay = () => {
      // Increase check frequency when playing (every 100ms for aggressive detection)
      if (screenCheckIntervalRef.current) {
        clearInterval(screenCheckIntervalRef.current);
      }
      screenCheckIntervalRef.current = setInterval(performDetectionCheck, 100);
      // Also check immediately
      performDetectionCheck();
    };

    const handleVideoPause = () => {
      // Reduce check frequency when paused
      if (screenCheckIntervalRef.current) {
        clearInterval(screenCheckIntervalRef.current);
      }
      screenCheckIntervalRef.current = setInterval(performDetectionCheck, 500);
    };

    // Monitor for unexpected video state changes that might indicate recording
    let lastVideoPaused = video.paused;
    const monitorVideoState = () => {
      // Check if video was paused unexpectedly (some recording tools pause video)
      if (!lastVideoPaused && video.paused) {
        // Video was paused unexpectedly - might indicate recording interference
        performDetectionCheck();
      }
      lastVideoPaused = video.paused;
    };

    // Monitor video state every 50ms
    const videoStateInterval = setInterval(monitorVideoState, 50);

    video.addEventListener("play", handleVideoPlay);
    video.addEventListener("playing", handleVideoPlay);
    video.addEventListener("pause", handleVideoPause);

    // Use ResizeObserver to detect when elements overlay the video
    const resizeObserver = new ResizeObserver(() => {
      performDetectionCheck();
    });

    // Observe the video element and its container for size changes
    resizeObserver.observe(video);
    const container = containerRef.current;
    if (container) {
      resizeObserver.observe(container);
    }

    // Use IntersectionObserver to detect overlays
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        // If video visibility changes unexpectedly, might indicate recording
        for (const entry of entries) {
          if (entry.target === video) {
            // Check if video is being obscured
            if (entry.intersectionRatio < 0.95 && !video.paused) {
              // Video is mostly obscured - might be recording overlay
              performDetectionCheck();
            }
          }
        }
      },
      {
        threshold: [0, 0.5, 0.95, 1],
      }
    );

    intersectionObserver.observe(video);

    // Monitor for canvas/iframe elements that might overlay video
    const overlayObserver = new MutationObserver(() => {
      performDetectionCheck();
    });

    // Observe document for any element additions that might overlay video
    overlayObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    // Initial periodic check
    screenCheckIntervalRef.current = setInterval(performDetectionCheck, 500);

    // Also check on visibility change (screen sharing might affect visibility)
    const handleVisibilityChange = () => {
      const captured = detectScreenSharing();
      setIsScreenSharing((prev) => {
        if (captured !== prev) {
          if (captured && video) {
            video.pause();
          }
          return captured;
        }
        return prev;
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Monitor for focus changes (screen sharing might cause focus loss)
    const handleFocusChange = () => {
      setTimeout(() => {
        const captured = detectScreenSharing();
        setIsScreenSharing((prev) => {
          if (captured !== prev) {
            if (captured && video) {
              video.pause();
            }
            return captured;
          }
          return prev;
        });
      }, 100);
    };

    window.addEventListener("blur", handleFocusChange);
    window.addEventListener("focus", handleFocusChange);

    return () => {
      if (screenCheckIntervalRef.current) {
        clearInterval(screenCheckIntervalRef.current);
        screenCheckIntervalRef.current = null;
      }

      // Remove video event listeners
      video.removeEventListener("play", handleVideoPlay);
      video.removeEventListener("playing", handleVideoPlay);
      video.removeEventListener("pause", handleVideoPause);

      // Clear video state monitoring interval
      if (videoStateInterval) {
        clearInterval(videoStateInterval);
      }

      // Disconnect all observers
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      overlayObserver.disconnect();

      // Clean up detection canvas
      if (detectionCanvas) {
        // Clear draw interval if it exists
        if ((detectionCanvas as any)._drawInterval) {
          clearInterval((detectionCanvas as any)._drawInterval);
        }
        if (detectionCanvas.parentNode) {
          detectionCanvas.parentNode.removeChild(detectionCanvas);
        }
      }

      try {
        (document as any).removeEventListener(
          "capturedchange",
          handleCapturedChange
        );
      } catch (e) {
        // Event not supported
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleFocusChange);
      window.removeEventListener("focus", handleFocusChange);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    // Prevent playing if screen sharing is detected
    if (isScreenSharing) {
      return;
    }

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.min(video.currentTime + 10, duration);
  };

  const skipBackward = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(video.currentTime - 10, 0);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // Check if we're on iOS (Safari)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (!isFullscreen) {
      // iOS Safari requires webkitEnterFullscreen on the video element
      if (isIOS && (video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
      } else if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        (container as any).mozRequestFullScreen();
      } else if ((container as any).msRequestFullscreen) {
        (container as any).msRequestFullscreen();
      }
    } else {
      // iOS Safari doesn't support programmatic exit, user must use native controls
      // But we'll still try to exit if possible
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const hls = hlsRef.current;
    if (!hls) return;

    const selectedLevel = parseInt(e.target.value);

    if (selectedLevel === -1) {
      // Auto quality
      setIsManualQuality(false);
      isManualQualityRef.current = false;
      hls.currentLevel = -1; // Auto
    } else {
      // Manual quality selection
      setIsManualQuality(true);
      isManualQualityRef.current = true;
      hls.currentLevel = selectedLevel;
      setCurrentQualityLevel(selectedLevel);
      console.log(`Quality changed to level: ${selectedLevel}`);
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${
        isFullscreen
          ? "h-screen flex items-center justify-center"
          : "max-w-6xl mx-auto rounded-sm"
      } bg-black overflow-hidden shadow-2xl ${className}`}
      tabIndex={0}
      onFocus={() => {}}
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-red-500 text-center p-4">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Screen Sharing/Recording Detection Overlay */}
      {isScreenSharing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-center p-8">
            <div className="mb-4">
              <svg
                className="w-16 h-16 mx-auto text-white/80"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Screen Sharing/Recording Detected
            </h2>
            <p className="text-lg text-white/80">
              Recording or sharing your screen is not allowed.
            </p>
            <p className="text-sm text-white/60 mt-4">
              Please stop screen sharing or recording to continue watching.
            </p>
          </div>
        </div>
      )}

      <div
        className={`${
          isFullscreen
            ? "w-full h-full flex items-center justify-center"
            : "w-full"
        }`}
      >
        <video
          ref={videoRef}
          className={`${
            isFullscreen
              ? "max-w-full max-h-full w-full h-auto object-contain"
              : "w-full h-auto"
          } aspect-video cursor-pointer`}
          playsInline
          controls={false}
          preload="auto"
          onClick={(e) => {
            // Prevent event from bubbling to controls
            e.stopPropagation();
            togglePlay();
          }}
        />
      </div>

      {/* Title and Subtitle */}
      {(title || subtitle) && (
        <div
          className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Black gradient background */}
          <div className="absolute inset-0 bg-linear-to-b from-black to-transparent pointer-events-none" />
          <div className="relative p-4">
            {title && (
              <h2 className="text-base md:text-lg lg:text-xl font-bold text-white mb-1 drop-shadow-lg line-clamp-1">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-sm text-white/90 drop-shadow-lg line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Center Controls (Play/Pause and Skip buttons) */}
      {(!isLoading || !isBuffering) && (
        <div
          className={`absolute inset-0 flex items-center justify-center z-20 pointer-events-none transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-4 pointer-events-auto">
            {/* Skip Backward 10s Button */}
            <button
              onClick={skipBackward}
              className="w-8 md:w-14 h-8 md:h-14 p-1 rounded-full bg-black/50 hover:bg-black/90 transition-all flex items-center justify-center group"
              aria-label="Skip backward 10 seconds"
            >
              <MdOutlineReplay10 className="h-full w-full text-white" />
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="h-10 md:w-20 w-10 md:h-20 p-1 rounded-full bg-black/50 hover:bg-black/90 transition-all flex items-center justify-center group"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg
                  className="w-14 h-14 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg
                  className="w-14 h-14 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip Forward 10s Button */}
            <button
              onClick={skipForward}
              className="w-8 md:w-14 h-8 md:h-14 rounded-full bg-black/50 p-1 hover:bg-black/90 transition-all flex items-center justify-center group"
              aria-label="Skip forward 10 seconds"
            >
              <MdOutlineForward10 className="h-full w-full text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Custom Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress Bar - YouTube Style */}
        <div
          className="relative h-1 group cursor-pointer"
          onMouseEnter={() => {}}
        >
          {/* Buffered ranges */}
          {duration > 0 && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gray-500/30 ">
              {bufferedRanges.map((range, index) => {
                const startPercent = Math.min(
                  (range.start / duration) * 100,
                  100
                );
                const endPercent = Math.min((range.end / duration) * 100, 100);
                const width = Math.max(endPercent - startPercent, 0);
                return (
                  <div
                    key={index}
                    className="absolute top-0 h-1 bg-gray-500/50 transition-all"
                    style={{
                      left: `${startPercent}%`,
                      width: `${width}%`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="absolute top-0 left-0 w-full h-1 opacity-0 cursor-pointer z-10"
          />

          {/* Visual progress indicator */}
          <div
            className="absolute top-0 left-0 h-1 bg-red-600 transition-all duration-75"
            style={{
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            }}
          />

          {/* Progress thumb (YouTube style) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: `calc(${
                duration > 0 ? (currentTime / duration) * 100 : 0
              }% - 6px)`,
            }}
          />
        </div>

        {/* Controls Bar */}
        <div className="flex items-center px-2 py-2 text-white">
          {/* Left Controls */}
          <div className="flex items-center gap-1">
            {/* Volume Control */}
            <div
              className="flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={toggleMute}
                className="flex items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded-full transition-colors"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>

              {/* Volume Slider (YouTube style - appears on hover) */}
              {showVolumeSlider && (
                <div className="flex items-center px-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-white/30 rounded appearance-none cursor-pointer volume-slider"
                    style={{
                      background: `linear-gradient(to right, #fff 0%, #fff ${
                        volume * 100
                      }%, rgba(255,255,255,0.3) ${
                        volume * 100
                      }%, rgba(255,255,255,0.3) 100%)`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Time Display */}
            <div className="text-xs text-white/90 px-2 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Quality Selector */}
            {qualityLevels.length > 0 && (
              <button
                onClick={(e) => {
                  // Simple quality toggle for now - can be enhanced with dropdown
                  const current = isManualQuality ? currentQualityLevel : -1;
                  const nextIndex =
                    qualityLevels.findIndex((q) => q.level === current) + 1;
                  if (nextIndex >= qualityLevels.length) {
                    handleQualityChange({ target: { value: "-1" } } as any);
                  } else {
                    handleQualityChange({
                      target: {
                        value: qualityLevels[nextIndex].level.toString(),
                      },
                    } as any);
                  }
                }}
                className="flex items-center justify-center min-w-[60px] h-8 text-white hover:bg-white/10 rounded px-2 text-xs font-medium transition-colors"
                aria-label="Quality"
              >
                {isManualQuality
                  ? qualityLevels.find((q) => q.level === currentQualityLevel)
                      ?.label || "Auto"
                  : "Auto"}
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="flex items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded-full transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
