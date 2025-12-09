import React, { useRef, useEffect, useState } from "react";
import {
  User,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from "lucide-react";

const VideoGrid = ({
  localStream,
  remoteStreams,
  participants,
  isVideoEnabled,
  userName,
  connectionStatus,
}) => {
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef(new Map());
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle local video stream - CRITICAL FIX for "vibrating"
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting local video stream");
      localVideoRef.current.srcObject = localStream;

      // Prevent multiple tracks causing vibration
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
      }
    }
  }, [localStream, isVideoEnabled]);

  // Handle remote video streams - CRITICAL FIX for "vibrating"
  useEffect(() => {
    const updateRemoteVideos = () => {
      remoteStreams.forEach((stream, userId) => {
        const videoElement = remoteVideoRefs.current.get(userId);
        if (videoElement && stream) {
          // Check if we already have this stream
          if (videoElement.srcObject !== stream) {
            console.log(`Setting remote video for ${userId}`);
            videoElement.srcObject = stream;
          }

          // Ensure only one video track is active
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 1) {
            console.warn(`Multiple video tracks for ${userId}, keeping first`);
            for (let i = 1; i < videoTracks.length; i++) {
              videoTracks[i].stop();
            }
          }
        }
      });
    };

    updateRemoteVideos();
  }, [remoteStreams]);

  const allParticipants = [
    {
      userId: "local",
      userName: `${userName} (You)`,
      stream: localStream,
      videoEnabled: isVideoEnabled,
      audioEnabled: true,
      isLocal: true,
    },
    ...participants.map((p) => ({
      ...p,
      stream: remoteStreams.get(p.userId),
      isLocal: false,
    })),
  ];

  // Calculate responsive grid
  const getGridClass = (count) => {
    if (isMobile) return "grid-cols-1 gap-2";

    switch (count) {
      case 1:
        return "grid-cols-1 gap-4";
      case 2:
        return "grid-cols-2 gap-4";
      case 3:
        return "grid-cols-2 lg:grid-cols-3 gap-4";
      case 4:
        return "grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3";
      default:
        return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3";
    }
  };

  const getVideoSize = (count) => {
    if (isMobile) return "aspect-[4/3]";
    if (count <= 2) return "aspect-video";
    if (count <= 4) return "aspect-[4/3]";
    return "aspect-square";
  };

  return (
    <div className="w-full">
      {/* Connection Status */}
      {connectionStatus === "connecting" && (
        <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-blue-400 font-medium">
              Connecting to participants...
            </span>
          </div>
        </div>
      )}

      {/* Video Grid */}
      <div className={`grid ${getGridClass(allParticipants.length)}`}>
        {allParticipants.map((participant) => {
          const hasStream =
            participant.stream && participant.stream.getTracks().length > 0;
          const videoTrack = hasStream
            ? participant.stream.getVideoTracks()[0]
            : null;
          const isConnecting = !hasStream && !participant.isLocal;

          return (
            <div
              key={participant.userId}
              className={`relative ${getVideoSize(
                allParticipants.length
              )} bg-gray-900 rounded-xl overflow-hidden border ${
                isConnecting
                  ? "border-yellow-500/30"
                  : participant.isLocal
                  ? "border-primary-500/30"
                  : "border-gray-800"
              } ${isConnecting ? "animate-pulse" : ""}`}
            >
              {/* Video Element */}
              <div className="absolute inset-0 bg-gray-950">
                {hasStream && videoTrack ? (
                  <video
                    ref={
                      participant.isLocal
                        ? localVideoRef
                        : (el) => {
                            if (el)
                              remoteVideoRefs.current.set(
                                participant.userId,
                                el
                              );
                          }
                    }
                    autoPlay
                    playsInline
                    muted={participant.isLocal}
                    className="w-full h-full object-cover"
                    onLoadedData={() =>
                      console.log(`${participant.userId} video loaded`)
                    }
                    onError={(e) =>
                      console.error(`${participant.userId} video error:`, e)
                    }
                    // Prevent multiple video elements causing vibration
                    style={{
                      transform: "translateZ(0)",
                      backfaceVisibility: "hidden",
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isConnecting ? (
                      <div className="text-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
                        <div className="text-yellow-400 text-sm">
                          Connecting...
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`${
                          isMobile ? "w-16 h-16" : "w-20 h-20"
                        } rounded-full bg-gray-800 flex items-center justify-center`}
                      >
                        <User
                          className={`${
                            isMobile ? "h-8 w-8" : "h-10 w-10"
                          } text-gray-600`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Participant Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 sm:p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      {participant.audioEnabled ? (
                        <Mic className="h-3 w-3 text-green-400" />
                      ) : (
                        <MicOff className="h-3 w-3 text-red-400" />
                      )}
                      {participant.videoEnabled ? (
                        <Video className="h-3 w-3 text-green-400" />
                      ) : (
                        <VideoOff className="h-3 w-3 text-red-400" />
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-white truncate max-w-[80px] sm:max-w-[120px]">
                      {participant.userName}
                    </span>
                  </div>
                  {participant.isLocal && (
                    <span className="px-2 py-0.5 bg-primary-500/20 text-primary-300 text-xs rounded">
                      You
                    </span>
                  )}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="absolute top-2 right-2">
                <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
                  {hasStream ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-400">Live</span>
                    </>
                  ) : isConnecting ? (
                    <>
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-xs text-yellow-400">
                        Connecting
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-400">Offline</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
