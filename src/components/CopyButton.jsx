import { useState } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./CopyButton.css";

export default function CopyButton({
  text,
  label = "📋 Copy",
  showToast,
  className = "",
  small = false,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const success = await copyToClipboard(text, showToast);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      className={`copy-btn ${small ? "copy-btn-small" : ""} ${copied ? "copy-btn-copied" : ""} ${className}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
