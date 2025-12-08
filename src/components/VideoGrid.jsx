import React, { useRef, useEffect } from "react";
import {
  UserIcon,
  MicrophoneIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

const VideoGrid = ({
  localStream,
  remoteStreams,
  participants,
  isVideoEnabled,
  userName,
}) => {
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef({});

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      if (remoteVideoRefs.current[userId] && stream) {
        remoteVideoRefs.current[userId].srcObject = stream;
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
    },
    ...participants.map((p) => ({
      ...p,
      stream: remoteStreams[p.userId],
    })),
  ];

  const getGridClass = (count) => {
    switch (count) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
      case 4:
        return "grid-cols-2 lg:grid-cols-2";
      default:
        return "grid-cols-2 lg:grid-cols-3";
    }
  };

  return (
    <div className={`grid ${getGridClass(allParticipants.length)} gap-4 mb-6`}>
      {allParticipants.map((participant) => (
        <div
          key={participant.userId}
          className="relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800 group"
        >
          {/* Video Element */}
          <div className="aspect-video bg-gray-950">
            {participant.stream && (
              <video
                ref={
                  participant.userId === "local"
                    ? localVideoRef
                    : (ref) =>
                        (remoteVideoRefs.current[participant.userId] = ref)
                }
                autoPlay
                playsInline
                muted={participant.userId === "local"}
                className="w-full h-full object-cover"
              />
            )}

            {/* Fallback when video is disabled */}
            {(!participant.videoEnabled || !participant.stream) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center">
                  <UserIcon className="h-16 w-16 text-gray-600" />
                </div>
              </div>
            )}
          </div>

          {/* Participant Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  {participant.audioEnabled ? (
                    <MicrophoneIcon className="h-4 w-4 text-green-400" />
                  ) : (
                    <MicrophoneIcon className="h-4 w-4 text-red-400" />
                  )}
                  {participant.videoEnabled ? (
                    <VideoCameraIcon className="h-4 w-4 text-green-400" />
                  ) : (
                    <VideoCameraIcon className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <span className="font-medium text-white truncate">
                  {participant.userName}
                </span>
              </div>
              {participant.userId === "local" && (
                <span className="px-2 py-1 bg-primary-500/20 text-primary-300 text-xs rounded">
                  You
                </span>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <div className="absolute top-4 right-4">
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  participant.stream
                    ? "bg-green-500 animate-pulse"
                    : "bg-yellow-500"
                }`}
              />
              <span className="text-xs text-gray-300">
                {participant.stream ? "Connected" : "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VideoGrid;
