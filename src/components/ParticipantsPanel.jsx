import React from "react";
import { Users, Mic, MicOff, Video, VideoOff, Crown } from "lucide-react";

const ParticipantsPanel = ({ participants, currentUser }) => {
  const allParticipants = [
    {
      userId: currentUser.userId,
      userName: currentUser.userName,
      isHost: true,
      videoEnabled: true,
      audioEnabled: true,
      isYou: true,
    },
    ...participants.map((p) => ({
      ...p,
      isHost: false,
      isYou: false,
    })),
  ];

  return (
    <div className="bg-gray-900/80 backdrop-blur-lg rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <Users className="h-5 w-5" />
          <span>Participants ({allParticipants.length})</span>
        </h3>
      </div>

      <div className="space-y-3">
        {allParticipants.map((participant) => (
          <div
            key={participant.userId}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition"
          >
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center">
                  <span className="font-bold text-white">
                    {participant.userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                {participant.isHost && (
                  <div className="absolute -top-1 -right-1">
                    <Crown className="h-4 w-4 text-yellow-400" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-white truncate max-w-[120px]">
                    {participant.userName}
                  </span>
                  {participant.isYou && (
                    <span className="px-2 py-0.5 bg-primary-500/20 text-primary-300 text-xs rounded">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2 mt-1">
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
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  participant.userId === currentUser.userId
                    ? "bg-green-500 animate-pulse"
                    : "bg-green-400"
                }`}
              />
              <span className="text-xs text-gray-400">
                {participant.userId === currentUser.userId
                  ? "Connected"
                  : "Active"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsPanel;
