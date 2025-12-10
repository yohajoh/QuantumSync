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
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());
  const [gridConfig, setGridConfig] = useState({
    cols: "grid-cols-1",
    aspect: "aspect-video",
  });

  // Handle local video - FIXED
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting local video stream");
      localVideoRef.current.srcObject = localStream;

      // Ensure the video plays
      localVideoRef.current.play().catch((e) => {
        console.log("Video play error:", e);
      });

      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
        console.log(`Local video track enabled: ${videoTrack.enabled}`);
      }
    }
  }, [localStream, isVideoEnabled]);

  // Handle remote videos - FIXED
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement && stream && videoElement.srcObject !== stream) {
        console.log(`Setting remote video for ${userId}`);
        videoElement.srcObject = stream;

        // Ensure the video plays
        videoElement.play().catch((e) => {
          console.log(`Remote video play error for ${userId}:`, e);
        });
      }
    });

    // Clean up removed streams
    const currentUserIds = Array.from(remoteStreams.keys());
    const existingUserIds = Array.from(remoteVideoRefs.current.keys());

    existingUserIds.forEach((userId) => {
      if (!currentUserIds.includes(userId)) {
        const videoElement = remoteVideoRefs.current.get(userId);
        if (videoElement) {
          videoElement.srcObject = null;
        }
        remoteVideoRefs.current.delete(userId);
      }
    });
  }, [remoteStreams]);

  // Calculate dynamic grid based on participant count - remains the same
  useEffect(() => {
    const totalParticipants = participants.length + 1;

    let cols, aspect;

    if (isMobile) {
      cols = "grid-cols-1";
      aspect = "aspect-[3/4]";
    } else {
      switch (true) {
        case totalParticipants === 1:
          cols = "grid-cols-1";
          aspect = "aspect-video";
          break;
        case totalParticipants === 2:
          cols = "grid-cols-2";
          aspect = "aspect-video";
          break;
        case totalParticipants <= 4:
          cols = "grid-cols-2";
          aspect = "aspect-[4/3]";
          break;
        case totalParticipants <= 6:
          cols = "grid-cols-3";
          aspect = "aspect-square";
          break;
        case totalParticipants <= 8:
          cols = "grid-cols-4";
          aspect = "aspect-square";
          break;
        case totalParticipants <= 12:
          cols = "grid-cols-4";
          aspect = "aspect-square";
          break;
        default:
          cols = "grid-cols-4 lg:grid-cols-6";
          aspect = "aspect-square";
      }
    }

    setGridConfig({ cols, aspect });
  }, [participants.length, isMobile]);

  const allParticipants = [
    {
      userId: "local",
      userName: `${userName} (You)`,
      stream: localStream,
      videoEnabled: isVideoEnabled,
      audioEnabled: true,
      isLocal: true,
      isScreenSharing:
        activeScreenShare === userId.current || activeScreenShare === "local",
    },
    ...participants.map((p) => ({
      ...p,
      stream: remoteStreams.get(p.userId),
      isLocal: false,
      isScreenSharing: activeScreenShare === p.userId,
    })),
  ];

  // Sort participants
  const sortedParticipants = [...allParticipants].sort((a, b) => {
    if (a.isScreenSharing && !b.isScreenSharing) return -1;
    if (!a.isScreenSharing && b.isScreenSharing) return 1;
    if (a.videoEnabled && !b.videoEnabled) return -1;
    if (!a.videoEnabled && b.videoEnabled) return 1;
    return 0;
  });

  return (
    <div className="w-full">
      {/* Connection Status */}
      {connectionStatus === "connecting" && (
        <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-blue-400 font-medium">
              Establishing connections with participants...
            </span>
          </div>
        </div>
      )}

      {/* Participant Count */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-sm text-gray-400">
            <User className="h-4 w-4" />
            <span>{allParticipants.length} participants</span>
          </div>
          <div className="flex items-center space-x-1 text-sm text-gray-400">
            <Video className="h-4 w-4" />
            <span>
              {
                allParticipants.filter(
                  (p) =>
                    p.videoEnabled || p.stream?.getVideoTracks()?.length > 0
                ).length
              }{" "}
              cameras
            </span>
          </div>
          {activeScreenShare && (
            <div className="flex items-center space-x-1 text-sm text-yellow-400">
              <Share2 className="h-4 w-4" />
              <span>Screen sharing active</span>
            </div>
          )}
        </div>

        {allParticipants.length > 8 && !isMobile && (
          <div className="text-sm text-gray-500">
            Scroll to see more participants →
          </div>
        )}
      </div>

      {/* Video Grid Container */}
      <div
        className={`relative ${
          isMobile
            ? "max-h-[70vh] overflow-y-auto"
            : "max-h-[70vh] overflow-hidden hover:overflow-y-auto"
        }`}
      >
        <div className={`grid ${gridConfig.cols} gap-4 p-1`}>
          {sortedParticipants.map((participant) => {
            const hasStream =
              participant.stream && participant.stream.getTracks().length > 0;
            const videoTrack = hasStream
              ? participant.stream.getVideoTracks()[0]
              : null;
            const isConnecting = !hasStream && !participant.isLocal;

            return (
              <div
                key={participant.userId}
                className={`relative ${
                  gridConfig.aspect
                } bg-gray-900 rounded-xl overflow-hidden border-2 ${
                  participant.isScreenSharing
                    ? "border-yellow-500 shadow-lg shadow-yellow-500/20"
                    : participant.isLocal
                    ? "border-primary-500/50"
                    : "border-gray-800"
                } ${
                  isConnecting ? "animate-pulse" : ""
                } transition-all duration-300`}
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
                <div className="absolute inset-0 bg-gray-950">
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
                      className="w-full h-full object-cover bg-black"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4">
                      {isConnecting ? (
                        <div className="text-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
                          <div className="text-yellow-400 text-sm">
                            Connecting...
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`${
                              isMobile ? "w-16 h-16" : "w-20 h-20"
                            } rounded-full bg-gray-800 flex items-center justify-center mb-3`}
                          >
                            <User
                              className={`${
                                isMobile ? "h-8 w-8" : "h-10 w-10"
                              } text-gray-600`}
                            />
                          </div>
                          <p className="text-gray-400 text-sm text-center truncate w-full">
                            {participant.userName}
                          </p>
                          {!participant.videoEnabled && (
                            <p className="text-xs text-gray-500 mt-1">
                              Camera off
                            </p>
                          )}
                        </>
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
                        } font-medium text-white truncate max-w-[80px] sm:max-w-[120px]`}
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

      {/* Scroll Indicator for mobile */}
      {isMobile && allParticipants.length > 1 && (
        <div className="mt-2 text-center">
          <div className="inline-flex items-center space-x-1 text-xs text-gray-500">
            <span>↑↓</span>
            <span>Scroll to see all participants</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGrid;
