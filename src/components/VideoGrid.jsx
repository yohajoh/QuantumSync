import React, { useRef, useEffect } from "react";
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

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoRef = remoteVideoRefs.current.get(userId);
      if (videoRef && stream) {
        videoRef.srcObject = stream;
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

  // Calculate grid layout based on participant count and screen size
  const isMobile = window.innerWidth < 768;
  const getGridClass = (count) => {
    if (isMobile) {
      return "grid-cols-1";
    }

    switch (count) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-2 lg:grid-cols-2 xl:grid-cols-4";
      case 5:
      case 6:
        return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-3";
      default:
        return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    }
  };

  const getVideoSize = (count) => {
    if (isMobile) {
      return "aspect-[4/3]";
    }

    if (count <= 2) return "aspect-video";
    if (count <= 4) return "aspect-[4/3]";
    return "aspect-square";
  };

  return (
    <div className="w-full">
      {/* Connection Status Banner */}
      {connectionStatus === "connecting" && (
        <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-blue-400 font-medium">
              Connecting to participants... This may take a moment.
            </span>
          </div>
        </div>
      )}

      {/* Video Grid */}
      <div
        className={`grid ${getGridClass(allParticipants.length)} gap-3 ${
          isMobile ? "gap-2" : "gap-4"
        }`}
      >
        {allParticipants.map((participant) => {
          const hasStream =
            participant.stream && participant.stream.getTracks().length > 0;
          const isConnecting = !hasStream && !participant.isLocal;

          return (
            <div
              key={participant.userId}
              className={`relative ${getVideoSize(
                allParticipants.length
              )} bg-gray-900 rounded-xl overflow-hidden border ${
                isConnecting
                  ? "border-yellow-500/30 animate-pulse"
                  : participant.isLocal
                  ? "border-primary-500/30"
                  : "border-gray-800"
              } group`}
            >
              {/* Video Element */}
              <div className="absolute inset-0 bg-gray-950">
                {hasStream ? (
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
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isConnecting ? (
                      <div className="text-center space-y-3">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto"></div>
                        <div className="text-yellow-400 text-sm font-medium">
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
                    <span className="text-sm font-medium text-white truncate max-w-[100px] sm:max-w-[150px]">
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

              {/* Connection Status Indicator */}
              <div className="absolute top-3 right-3">
                <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
                  {hasStream ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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
