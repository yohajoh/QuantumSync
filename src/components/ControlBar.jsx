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
  Maximize2,
  Minimize2,
  CameraOff,
  MicOff as MicDisabled,
  Share2,
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
  hasCameraAccess = true,
  hasMicAccess = true,
  mobile = false,
}) => {
  if (mobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 p-3 z-40">
        <div className="flex items-center justify-around">
          {/* Video Toggle */}
          <button
            onClick={onToggleVideo}
            className={`flex flex-col items-center p-3 rounded-lg transition ${
              isVideoEnabled && hasCameraAccess ? "bg-gray-800" : "bg-red-600"
            }`}
            disabled={!hasCameraAccess}
          >
            {hasCameraAccess ? (
              isVideoEnabled ? (
                <Video className="h-5 w-5 text-green-400" />
              ) : (
                <VideoOff className="h-5 w-5 text-white" />
              )
            ) : (
              <CameraOff className="h-5 w-5 text-red-400" />
            )}
            <span className="text-xs mt-1 text-gray-300">
              {hasCameraAccess ? (isVideoEnabled ? "Video" : "Off") : "No Cam"}
            </span>
          </button>

          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`flex flex-col items-center p-3 rounded-lg transition ${
              isAudioEnabled && hasMicAccess ? "bg-gray-800" : "bg-red-600"
            }`}
            disabled={!hasMicAccess}
          >
            {hasMicAccess ? (
              isAudioEnabled ? (
                <Mic className="h-5 w-5 text-green-400" />
              ) : (
                <MicOff className="h-5 w-5 text-white" />
              )
            ) : (
              <MicDisabled className="h-5 w-5 text-red-400" />
            )}
            <span className="text-xs mt-1 text-gray-300">
              {hasMicAccess ? (isAudioEnabled ? "Audio" : "Muted") : "No Mic"}
            </span>
          </button>

          {/* Screen Share - Mobile */}
          <button
            onClick={onToggleScreenShare}
            className={`flex flex-col items-center p-3 rounded-lg transition ${
              isScreenSharing ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            <Share2
              className={`h-5 w-5 ${
                isScreenSharing ? "text-white" : "text-blue-400"
              }`}
            />
            <span className="text-xs mt-1 text-gray-300">
              {isScreenSharing ? "Stop" : "Share"}
            </span>
          </button>

          {/* Fullscreen Toggle - Mobile */}
          <button
            onClick={onToggleFullscreen}
            className="flex flex-col items-center p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5 text-gray-300" />
            ) : (
              <Maximize2 className="h-5 w-5 text-gray-300" />
            )}
            <span className="text-xs mt-1 text-gray-300">
              {isFullscreen ? "Exit" : "Full"}
            </span>
          </button>

          {/* Leave Room */}
          <button
            onClick={onLeaveRoom}
            className="flex flex-col items-center p-3 rounded-lg bg-red-600 hover:bg-red-700 transition"
          >
            <Phone className="h-5 w-5 text-white transform rotate-135" />
            <span className="text-xs mt-1 text-white">Leave</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop Control Bar
  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-3 shadow-2xl">
        <div className="flex items-center space-x-4">
          {/* Video Toggle */}
          <button
            onClick={onToggleVideo}
            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isVideoEnabled && hasCameraAccess
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-red-600 hover:bg-red-700"
            } group`}
            disabled={!hasCameraAccess}
            title={
              hasCameraAccess
                ? isVideoEnabled
                  ? "Turn off camera"
                  : "Turn on camera"
                : "No camera available"
            }
          >
            {hasCameraAccess ? (
              isVideoEnabled ? (
                <Video className="h-6 w-6 text-green-400" />
              ) : (
                <VideoOff className="h-6 w-6 text-white" />
              )
            ) : (
              <CameraOff className="h-6 w-6 text-red-400" />
            )}
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {hasCameraAccess ? (isVideoEnabled ? "Video" : "Off") : "No Cam"}
            </span>
          </button>

          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isAudioEnabled && hasMicAccess
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-red-600 hover:bg-red-700"
            } group`}
            disabled={!hasMicAccess}
            title={
              hasMicAccess
                ? isAudioEnabled
                  ? "Mute microphone"
                  : "Unmute microphone"
                : "No microphone available"
            }
          >
            {hasMicAccess ? (
              isAudioEnabled ? (
                <Mic className="h-6 w-6 text-green-400" />
              ) : (
                <MicOff className="h-6 w-6 text-white" />
              )
            ) : (
              <MicDisabled className="h-6 w-6 text-red-400" />
            )}
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {hasMicAccess ? (isAudioEnabled ? "Audio" : "Muted") : "No Mic"}
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
            title={isScreenSharing ? "Stop screen sharing" : "Share screen"}
          >
            <Share2
              className={`h-6 w-6 ${
                isScreenSharing
                  ? "text-white"
                  : "text-blue-400 group-hover:text-blue-300"
              }`}
            />
            <span className="mt-1 text-xs font-medium text-gray-300 group-hover:text-white">
              {isScreenSharing ? "Stop Share" : "Share"}
            </span>
          </button>

          {/* Separator */}
          <div className="h-8 w-px bg-gray-700"></div>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-all duration-200 group"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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
            title="Leave meeting"
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
