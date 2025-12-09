import React, { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Send, Smile, Paperclip, MessageSquare } from "lucide-react";

const ChatPanel = ({
  messages,
  onSendMessage,
  currentUserId,
  mobile = false,
}) => {
  const [newMessage, setNewMessage] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle mobile keyboard visibility
  useEffect(() => {
    if (!mobile) return;

    const handleResize = () => {
      const isKeyboard = window.innerHeight < window.outerHeight * 0.9;
      setIsKeyboardVisible(isKeyboard);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobile]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage("");
      // Blur input on mobile to hide keyboard after sending
      if (mobile && inputRef.current) {
        inputRef.current.blur();
      }
    }
  };

  const handleInputFocus = () => {
    if (mobile) {
      // Scroll to bottom when input is focused on mobile
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  return (
    <div
      className={`${
        mobile
          ? "h-full flex flex-col"
          : "bg-gray-900/80 backdrop-blur-lg rounded-xl border border-gray-800 flex flex-col h-[600px]"
      } ${isKeyboardVisible ? "pb-20" : ""}`}
    >
      {!mobile && (
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Chat</h3>
          <p className="text-sm text-gray-400">
            Send messages to all participants
          </p>
        </div>
      )}

      {/* Messages Container */}
      <div
        className={`flex-1 overflow-y-auto ${mobile ? "p-2" : "p-4"} space-y-3`}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-gray-400">No messages yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.userId === currentUserId
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`${
                  mobile ? "max-w-[85%]" : "max-w-xs lg:max-w-md"
                } rounded-2xl p-3 ${
                  message.userId === currentUserId
                    ? "bg-primary-600 rounded-br-none"
                    : "bg-gray-800 rounded-bl-none"
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      message.userId === currentUserId
                        ? "text-primary-200"
                        : "text-gray-300"
                    }`}
                  >
                    {message.userName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {format(new Date(message.timestamp), "HH:mm")}
                  </span>
                </div>
                <p className="text-sm text-white break-words">
                  {message.message}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed for mobile */}
      <form
        onSubmit={handleSubmit}
        className={`${
          mobile
            ? "sticky bottom-0 bg-gray-900 border-t border-gray-800"
            : "border-t border-gray-800"
        } p-3`}
      >
        <div className="flex items-center space-x-2">
          {!mobile && (
            <>
              <button
                type="button"
                className="p-2 hover:bg-gray-800 rounded-lg transition"
              >
                <Paperclip className="h-5 w-5 text-gray-400" />
              </button>

              <button
                type="button"
                className="p-2 hover:bg-gray-800 rounded-lg transition"
              >
                <Smile className="h-5 w-5 text-gray-400" />
              </button>
            </>
          )}

          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onFocus={handleInputFocus}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            style={{
              fontSize: mobile ? "16px" : "14px", // Prevents iOS zoom on focus
            }}
          />

          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`p-2 rounded-lg transition ${
              newMessage.trim()
                ? "bg-primary-600 hover:bg-primary-700"
                : "bg-gray-800 cursor-not-allowed"
            }`}
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
