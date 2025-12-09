import React from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Phone,
  MessageSquare,
  Users,
  Settings,
  Maximize2,
  Minimize2,
} from "lucide-react";

const ControlBar = ({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onLeaveRoom,
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-3 shadow-2xl">
        <div className="flex items-center space-x-3">
          {/* Video Toggle */}
          <button
            onClick={onToggleVideo}
            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isVideoEnabled
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-red-600 hover:bg-red-700"
            } group`}
          >
            {isVideoEnabled ? (
              <Video className="h-6 w-6 text-green-400" />
            ) : (
              <VideoOff className="h-6 w-6 text-white" />
            )}
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {isVideoEnabled ? "Video" : "Off"}
            </span>
          </button>

          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isAudioEnabled
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-red-600 hover:bg-red-700"
            } group`}
          >
            {isAudioEnabled ? (
              <Mic className="h-6 w-6 text-green-400" />
            ) : (
              <MicOff className="h-6 w-6 text-white" />
            )}
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {isAudioEnabled ? "Audio" : "Muted"}
            </span>
          </button>

          {/* Screen Share */}
          <button
            onClick={onToggleScreenShare}
            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isScreenSharing
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-800 hover:bg-gray-700"
            } group`}
          >
            <Monitor
              className={`h-6 w-6 ${
                isScreenSharing
                  ? "text-white"
                  : "text-gray-300 group-hover:text-white"
              }`}
            />
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              Share
            </span>
          </button>

          {/* Separator */}
          <div className="h-8 w-px bg-gray-700"></div>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-all duration-200 group"
          >
            {isFullscreen ? (
              <Minimize2 className="h-6 w-6 text-gray-300 group-hover:text-white" />
            ) : (
              <Maximize2 className="h-6 w-6 text-gray-300 group-hover:text-white" />
            )}
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {isFullscreen ? "Exit" : "Full"}
            </span>
          </button>

          {/* Separator */}
          <div className="h-8 w-px bg-gray-700"></div>

          {/* Leave Room */}
          <button
            onClick={onLeaveRoom}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-600 hover:bg-red-700 transition-all duration-200 group"
          >
            <Phone className="h-6 w-6 text-white transform rotate-135" />
            <span className="mt-1 text-xs font-medium text-white">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ControlBar;
