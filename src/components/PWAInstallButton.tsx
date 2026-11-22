import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Smartphone, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundFX } from '../utils/sound';

interface PWAInstallButtonProps {
  compact?: boolean;
  variant?: 'button' | 'compact' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  variant,
}) => {
  const { t, soundEnabled } = useApp();
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (isInstalled) {
    return null;
  }

  const resolvedVariant = variant ?? (compact ? 'compact' : 'button');
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleInstallClick = async () => {
    soundFX.tap(soundEnabled);
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  const handleCopyUrl = async () => {
    soundFX.tap(soundEnabled);
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const renderTrigger = () => {
    if (resolvedVariant === 'banner') {
      return (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="w-full text-start rounded-3xl p-4 sm:p-5 bg-[#F3EBDD] border border-[#D5C7B2] hover:border-[#8B5E3C] shadow-[0_8px_22px_-12px_rgba(35,26,21,0.12)] transition flex items-center justify-between gap-4 cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#231A15] flex items-center justify-center text-[#FBF7F0] shadow-sm shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-base sm:text-lg font-extrabold text-[#231A15] truncate">
                {t.installBannerTitle}
              </h3>
              <p className="text-xs sm:text-sm text-[#6E5E50] leading-snug">
                {t.installBannerDesc}
              </p>
            </div>
          </div>

          <span className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>{t.installNowBtn}</span>
          </span>
        </button>
      );
    }

    if (resolvedVariant === 'compact') {
      return (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{t.installAppShort}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void handleInstallClick()}
        className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-sm font-bold flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{t.installApp}</span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#231A15]/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border border-[#D5C7B2] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#F3EBDD] border border-[#DDD2C0] flex items-center justify-center text-[#8B5E3C]">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold text-[#231A15]">
                  {isIOS ? t.iosInstallTitle : t.androidInstallTitle}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E5E50] hover:text-[#231A15] hover:bg-[#F3EBDD] cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isInIframe && (
              <div className="rounded-2xl bg-[#F3EBDD] border border-[#D5C7B2] p-3.5 space-y-3">
                <p className="text-xs sm:text-sm text-[#231A15] leading-relaxed">
                  {t.iframeInstallHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[42px] px-4 rounded-xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>{t.openInBrowser}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#FFFDF9] hover:bg-[#F6EFE3] border border-[#D5C7B2] text-[#231A15] text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedLink ? (
                      <Check className="w-4 h-4 text-[#4A6B46]" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#8B5E3C]" />
                    )}
                    <span>{copiedLink ? t.linkCopied : t.copyAppLink}</span>
                  </button>
                </div>
              </div>
            )}

            <ol className="space-y-3 text-sm text-[#4A3D33] leading-relaxed list-decimal list-inside">
              {isIOS ? (
                <>
                  <li>{t.iosInstallStep1}</li>
                  <li>{t.iosInstallStep2}</li>
                </>
              ) : (
                <>
                  <li>{t.androidInstallStep1}</li>
                  <li>{t.androidInstallStep2}</li>
                </>
              )}
            </ol>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[46px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-bold cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
