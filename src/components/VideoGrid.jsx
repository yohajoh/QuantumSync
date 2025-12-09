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
  isMobile = false,
}) => {
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef(new Map());
  const [gridCols, setGridCols] = useState("grid-cols-1");

  // Handle local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
      }
    }
  }, [localStream, isVideoEnabled]);

  // Handle remote videos
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement && stream && videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
      }
    });
  }, [remoteStreams]);

  // Calculate grid columns based on participant count and screen size
  useEffect(() => {
    const allParticipants = participants.length + 1; // +1 for local user
    let cols;

    if (isMobile) {
      cols = "grid-cols-1";
    } else {
      switch (true) {
        case allParticipants === 1:
          cols = "grid-cols-1";
          break;
        case allParticipants === 2:
          cols = "grid-cols-2";
          break;
        case allParticipants <= 4:
          cols = "grid-cols-2 lg:grid-cols-2";
          break;
        case allParticipants <= 6:
          cols = "grid-cols-2 lg:grid-cols-3";
          break;
        default:
          cols = "grid-cols-2 lg:grid-cols-4";
      }
    }

    setGridCols(cols);
  }, [participants.length, isMobile]);

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

  // Calculate video aspect ratio based on grid
  const getVideoClass = (count) => {
    if (isMobile) return "aspect-[3/4] sm:aspect-video";

    switch (true) {
      case count === 1:
        return "aspect-video";
      case count === 2:
        return "aspect-video";
      case count <= 4:
        return "aspect-[4/3] lg:aspect-video";
      default:
        return "aspect-[4/3] lg:aspect-square";
    }
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
      <div className={`grid ${gridCols} gap-4 ${isMobile ? "gap-2" : ""}`}>
        {allParticipants.map((participant) => {
          const hasStream =
            participant.stream && participant.stream.getTracks().length > 0;
          const videoTrack = hasStream
            ? participant.stream.getVideoTracks()[0]
            : null;
          const isConnecting = !hasStream && !participant.isLocal;
          const videoClass = getVideoClass(allParticipants.length);

          return (
            <div
              key={participant.userId}
              className={`relative ${videoClass} bg-gray-900 rounded-xl overflow-hidden border ${
                isConnecting
                  ? "border-yellow-500/30 animate-pulse"
                  : participant.isLocal
                  ? "border-primary-500/30"
                  : "border-gray-800"
              }`}
            >
              {/* Video Container */}
              <div className="absolute inset-0 bg-gray-950">
                {hasStream && videoTrack ? (
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
                    <span
                      className={`${
                        isMobile ? "text-xs" : "text-sm"
                      } font-medium text-white truncate max-w-[100px] sm:max-w-[150px]`}
                    >
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
              <div className="absolute top-2 right-2">
                <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
                  {hasStream ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-400 hidden sm:inline">
                        Live
                      </span>
                    </>
                  ) : isConnecting ? (
                    <>
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-yellow-400 hidden sm:inline">
                        Connecting
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        Offline
                      </span>
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
