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

  // Check mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle local video - SINGLE initialization
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting local video stream");
      localVideoRef.current.srcObject = localStream;

      // Ensure video track is properly enabled/disabled
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
      }
    }
  }, [localStream, isVideoEnabled]);

  // Handle remote videos - Efficient updates
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement && stream && videoElement.srcObject !== stream) {
        console.log(`Setting remote video for ${userId}`);
        videoElement.srcObject = stream;
      }
    });
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

  // Responsive grid calculation
  const getGridClass = (count) => {
    if (isMobile) return "grid-cols-1 gap-3";

    switch (count) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-2 lg:grid-cols-4";
      default:
        return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    }
  };

  return (
    <div className="w-full">
      {/* Video Grid */}
      <div className={`grid ${getGridClass(allParticipants.length)} gap-4`}>
        {allParticipants.map((participant) => {
          const hasStream =
            participant.stream && participant.stream.getTracks().length > 0;
          const isConnecting = !hasStream && !participant.isLocal;

          return (
            <div
              key={participant.userId}
              className={`relative aspect-video bg-gray-900 rounded-xl overflow-hidden border ${
                isConnecting
                  ? "border-yellow-500/30 animate-pulse"
                  : participant.isLocal
                  ? "border-primary-500/30"
                  : "border-gray-800"
              }`}
            >
              {/* Video Container */}
              <div className="absolute inset-0 bg-gray-950">
                {hasStream ? (
                  <video
                    ref={
                      participant.isLocal
                        ? localVideoRef
                        : (el) => {
                            if (
                              el &&
                              !remoteVideoRefs.current.has(participant.userId)
                            ) {
                              remoteVideoRefs.current.set(
                                participant.userId,
                                el
                              );
                            }
                          }
                    }
                    autoPlay
                    playsInline
                    muted={participant.isLocal}
                    className="w-full h-full object-cover"
                    onLoadedData={() =>
                      console.log(`${participant.userName} video loaded`)
                    }
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
                      <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center">
                        <User className="h-10 w-10 text-gray-600" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Participant Info Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
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
                    <span className="text-sm font-medium text-white truncate max-w-[120px]">
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

              {/* Connection Status */}
              <div className="absolute top-3 right-3">
                <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
                  {hasStream ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-400">Live</span>
                    </>
                  ) : isConnecting ? (
                    <>
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
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
