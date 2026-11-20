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
          className="w-full text-start rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-emerald-500/18 via-blue-600/20 to-violet-600/20 border border-emerald-400/35 hover:border-emerald-400/65 shadow-lg transition flex items-center justify-between gap-4 cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {t.installBannerTitle}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug">
                {t.installBannerDesc}
              </p>
            </div>
          </div>

          <span className="min-h-[42px] px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow">
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
          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
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
        className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 text-sm font-bold flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0E152B] border border-white/15 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold text-white">
                  {isIOS ? t.iosInstallTitle : t.androidInstallTitle}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isInIframe && (
              <div className="rounded-2xl bg-blue-600/15 border border-blue-400/30 p-3.5 space-y-3">
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                  {t.iframeInstallHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>{t.openInBrowser}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedLink ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copiedLink ? t.linkCopied : t.copyAppLink}</span>
                  </button>
                </div>
              </div>
            )}

            <ol className="space-y-3 text-sm text-slate-200 leading-relaxed list-decimal list-inside">
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
              className="w-full min-h-[46px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
