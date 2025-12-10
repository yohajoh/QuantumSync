import React, { useRef, useEffect, useState } from "react";
import {
  User,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  Share2,
} from "lucide-react";

const VideoGrid = ({
  localStream,
  remoteStreams,
  participants,
  isVideoEnabled,
  userName,
  connectionStatus,
  isMobile = false,
  activeScreenShare = null,
}) => {
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef(new Map());

  // Handle local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle remote videos
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement && stream && videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
      }
    });
  }, [remoteStreams]);

  const getGridClasses = () => {
    const totalParticipants = participants.length + 1;

    if (isMobile) {
      return "grid-cols-1 gap-4";
    }

    if (totalParticipants <= 2) {
      return "grid-cols-1 md:grid-cols-2 gap-4";
    } else if (totalParticipants <= 4) {
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4";
    } else {
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
    }
  };

  const getVideoHeight = () => {
    if (isMobile) {
      return "h-64";
    }
    return "h-48 lg:h-64";
  };

  const allParticipants = [
    {
      userId: "local",
      userName: `${userName} (You)`,
      stream: localStream,
      videoEnabled: isVideoEnabled,
      audioEnabled: true,
      isLocal: true,
      isScreenSharing: activeScreenShare === "local",
    },
    ...participants.map((p) => ({
      ...p,
      stream: remoteStreams.get(p.userId),
      isLocal: false,
      videoEnabled: true,
      audioEnabled: true,
      isScreenSharing: activeScreenShare === p.userId,
    })),
  ];

  return (
    <div className="w-full">
      {connectionStatus === "connecting" && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-blue-400 text-sm">
              Connecting to participants...
            </span>
          </div>
        </div>
      )}

      <div className={`grid ${getGridClasses()}`}>
        {allParticipants.map((participant) => {
          const hasStream = participant.stream;
          const isConnecting = !hasStream && !participant.isLocal;

          return (
            <div
              key={participant.userId}
              className={`relative ${getVideoHeight()} bg-gray-900 rounded-lg overflow-hidden border ${
                participant.isScreenSharing
                  ? "border-yellow-500"
                  : participant.isLocal
                  ? "border-primary-500/50"
                  : "border-gray-700"
              } ${isConnecting ? "animate-pulse" : ""}`}
            >
              {/* Screen Share Indicator */}
              {participant.isScreenSharing && (
                <div className="absolute top-2 left-2 z-20">
                  <div className="flex items-center space-x-1 bg-yellow-600 text-white px-2 py-1 rounded-full text-xs">
                    <Share2 className="h-3 w-3" />
                    <span>Screen</span>
                  </div>
                </div>
              )}

              {/* Video Container */}
              <div className="absolute inset-0">
                {hasStream ? (
                  <video
                    ref={
                      participant.isLocal
                        ? localVideoRef
                        : (el) => {
                            if (el) {
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
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-800">
                    <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-3">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-300 text-sm text-center truncate w-full">
                      {participant.userName}
                    </p>
                    {isConnecting && (
                      <div className="mt-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500 mx-auto"></div>
                        <p className="text-yellow-400 text-xs mt-1">
                          Connecting...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Participant Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
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
                    <span className="text-sm text-white truncate max-w-[100px]">
                      {participant.userName}
                    </span>
                  </div>
                  {participant.isLocal && (
                    <span className="px-2 py-1 bg-primary-500/20 text-primary-300 text-xs rounded">
                      You
                    </span>
                  )}
                </div>
              </div>

              {/* Connection Status */}
              {!hasStream && !participant.isLocal && (
                <div className="absolute top-2 right-2">
                  <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
                    <WifiOff className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-400">Offline</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
