import React from "react";
import {
  VideoCameraIcon,
  MicrophoneIcon,
  ComputerDesktopIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

const ControlBar = ({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onLeaveRoom,
}) => {
  const ControlButton = ({
    onClick,
    active,
    activeColor = "bg-red-500 hover:bg-red-600",
    inactiveColor = "bg-gray-700 hover:bg-gray-600",
    icon: Icon,
    activeIcon: ActiveIcon,
    label,
    showActiveIcon = false,
  }) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 ${
        active ? activeColor : inactiveColor
      } group`}
    >
      <div className="relative">
        {showActiveIcon && active && ActiveIcon ? (
          <ActiveIcon className="h-6 w-6 text-white" />
        ) : (
          <Icon
            className={`h-6 w-6 ${
              active ? "text-white" : "text-gray-300 group-hover:text-white"
            }`}
          />
        )}
      </div>
      <span
        className={`mt-2 text-xs font-medium ${
          active ? "text-white" : "text-gray-400 group-hover:text-white"
        }`}
      >
        {label}
      </span>
    </button>
  );

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center space-x-4">
          <ControlButton
            onClick={onToggleVideo}
            active={isVideoEnabled}
            activeColor="bg-gray-700 hover:bg-gray-600"
            inactiveColor="bg-red-500 hover:bg-red-600"
            icon={VideoCameraIcon}
            label={isVideoEnabled ? "Video On" : "Video Off"}
            showActiveIcon
          />

          <ControlButton
            onClick={onToggleAudio}
            active={isAudioEnabled}
            activeColor="bg-gray-700 hover:bg-gray-600"
            inactiveColor="bg-red-500 hover:bg-red-600"
            icon={MicrophoneIcon}
            label={isAudioEnabled ? "Mute" : "Unmute"}
            showActiveIcon
          />

          <ControlButton
            onClick={onToggleScreenShare}
            active={isScreenSharing}
            activeColor="bg-blue-600 hover:bg-blue-700"
            inactiveColor="bg-gray-700 hover:bg-gray-600"
            icon={ComputerDesktopIcon}
            label={isScreenSharing ? "Stop Share" : "Share Screen"}
          />

          <div className="h-8 w-px bg-gray-700" />

          <ControlButton
            onClick={() => {}}
            active={false}
            icon={ChatBubbleLeftRightIcon}
            label="Chat"
          />

          <ControlButton
            onClick={() => {}}
            active={false}
            icon={UserGroupIcon}
            label="Participants"
          />

          <ControlButton
            onClick={() => {}}
            active={false}
            icon={Cog6ToothIcon}
            label="Settings"
          />

          <div className="h-8 w-px bg-gray-700" />

          <button
            onClick={onLeaveRoom}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-red-600 hover:bg-red-700 transition-all duration-200 group"
          >
            <PhoneIcon className="h-6 w-6 text-white transform rotate-135" />
            <span className="mt-2 text-xs font-medium text-white">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ControlBar;
