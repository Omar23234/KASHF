import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Shield,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import type { CardEvent, GameLengthMode, SpecialCardType, TurnMode } from '../types/game';
import { getCardTypeFromId } from '../utils/specialCards';
import { PlayerAvatar } from './PlayerAvatar';

export interface SelectablePlayer {
  uid: string;
  name: string;
  avatarColor: string;
}

const CARD_VISUALS: Record<
  SpecialCardType,
  {
    surface: string;
    border: string;
    btnActive: string;
    btnPassive: string;
    btnEmpty: string;
    iconBox: string;
    iconColor: string;
    titleColor: string;
    countBadgeActive: string;
    banner: string;
    confirmBtn: string;
    glowRgba: string;
    rayColor: string;
    particleColors: [string, string, string];
  }
> = {
  gold: {
    surface: 'bg-gradient-to-br from-[#FFFBEB] via-[#FEF3C7] to-[#FDE68A]',
    border: 'border-[#D97706]',
    btnActive:
      'bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A] border-[#D97706] text-[#78350F] hover:from-[#FDE68A] hover:to-[#FCD34D] cursor-pointer shadow-sm',
    btnPassive: 'bg-[#FFFBEB] border-[#F59E0B]/55 text-[#92400E] cursor-default',
    btnEmpty: 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default',
    iconBox: 'bg-gradient-to-br from-[#F59E0B] to-[#B45309] text-[#FFFBEB] border-[#FCD34D]',
    iconColor: 'text-[#B45309]',
    titleColor: 'text-[#78350F]',
    countBadgeActive: 'bg-[#B45309] text-[#FFFBEB]',
    banner: 'bg-[#FEF3C7] border-[#D97706] text-[#78350F]',
    confirmBtn: 'bg-[#B45309] hover:bg-[#92400E] text-[#FFFBEB]',
    glowRgba: 'rgba(245, 158, 11, 0.55)',
    rayColor: 'rgba(251, 191, 36, 0.28)',
    particleColors: ['#F59E0B', '#FDE047', '#B45309'],
  },
  switch: {
    surface: 'bg-gradient-to-br from-[#EFF6FF] via-[#DBEAFE] to-[#BFDBFE]',
    border: 'border-[#2563EB]',
    btnActive:
      'bg-gradient-to-r from-[#DBEAFE] to-[#BFDBFE] border-[#2563EB] text-[#1E3A8A] hover:from-[#BFDBFE] hover:to-[#93C5FD] cursor-pointer shadow-sm',
    btnPassive: 'bg-[#EFF6FF] border-[#3B82F6]/55 text-[#1D4ED8] cursor-default',
    btnEmpty: 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default',
    iconBox: 'bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-[#EFF6FF] border-[#93C5FD]',
    iconColor: 'text-[#1D4ED8]',
    titleColor: 'text-[#1E3A8A]',
    countBadgeActive: 'bg-[#1D4ED8] text-[#EFF6FF]',
    banner: 'bg-[#DBEAFE] border-[#2563EB] text-[#1E3A8A]',
    confirmBtn: 'bg-[#1D4ED8] hover:bg-[#1E40AF] text-[#EFF6FF]',
    glowRgba: 'rgba(37, 99, 235, 0.55)',
    rayColor: 'rgba(56, 189, 248, 0.28)',
    particleColors: ['#2563EB', '#38BDF8', '#1D4ED8'],
  },
  anti_switch: {
    surface: 'bg-gradient-to-br from-[#FEF2F2] via-[#FEE2E2] to-[#FECACA]',
    border: 'border-[#DC2626]',
    btnActive:
      'bg-gradient-to-r from-[#FEE2E2] to-[#FECACA] border-[#DC2626] text-[#7F1D1D] hover:from-[#FECACA] hover:to-[#FCA5A5] cursor-pointer shadow-sm',
    btnPassive: 'bg-[#FEF2F2] border-[#EF4444]/55 text-[#B91C1C] cursor-default',
    btnEmpty: 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default',
    iconBox: 'bg-gradient-to-br from-[#DC2626] to-[#991B1B] text-[#FEF2F2] border-[#FCA5A5]',
    iconColor: 'text-[#B91C1C]',
    titleColor: 'text-[#7F1D1D]',
    countBadgeActive: 'bg-[#B91C1C] text-[#FEF2F2]',
    banner: 'bg-[#FEE2E2] border-[#DC2626] text-[#7F1D1D]',
    confirmBtn: 'bg-[#B91C1C] hover:bg-[#991B1B] text-[#FEF2F2]',
    glowRgba: 'rgba(220, 38, 38, 0.55)',
    rayColor: 'rgba(248, 113, 113, 0.28)',
    particleColors: ['#DC2626', '#FB7185', '#991B1B'],
  },
};

const BURST_PARTICLES = Array.from({ length: 14 }, (_, idx) => {
  const angleRad = (idx / 14) * Math.PI * 2;
  const radius = 115 + (idx % 3) * 26;
  return {
    id: idx,
    x: Math.cos(angleRad) * radius,
    y: Math.sin(angleRad) * radius,
    size: idx % 2 === 0 ? 10 : 7,
    delay: (idx % 4) * 0.04,
  };
});

interface CardInventoryBarProps {
  goldCards: number;
  switchCards: number;
  antiSwitchCards: number;
  canUseGoldOrSwitch: boolean;
  canUseAntiSwitch: boolean;
  busy?: boolean;
  onUseGold: () => void;
  onUseSwitch: (targetUid: string) => void;
  onUseAntiSwitch: () => void;
  otherPlayers: SelectablePlayer[];
  privateToggleMode?: boolean;
  resetKey?: string | number;
}

export const CardInventoryBar: React.FC<CardInventoryBarProps> = ({
  goldCards,
  switchCards,
  antiSwitchCards,
  canUseGoldOrSwitch,
  canUseAntiSwitch,
  busy = false,
  onUseGold,
  onUseSwitch,
  onUseAntiSwitch,
  otherPlayers,
  privateToggleMode = false,
  resetKey,
}) => {
  const { t } = useApp();
  const [confirmModal, setConfirmModal] = useState<'gold' | 'switch' | 'anti_switch' | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string>('');
  const [cardsRevealed, setCardsRevealed] = useState<boolean>(!privateToggleMode);

  useEffect(() => {
    setCardsRevealed(!privateToggleMode);
  }, [privateToggleMode, resetKey]);

  const handleConfirmGold = () => {
    setConfirmModal(null);
    onUseGold();
  };

  const handleConfirmSwitch = () => {
    if (!selectedTargetUid) return;
    const target = selectedTargetUid;
    setConfirmModal(null);
    setSelectedTargetUid('');
    onUseSwitch(target);
  };

  const handleConfirmAntiSwitch = () => {
    setConfirmModal(null);
    onUseAntiSwitch();
  };

  const activeModalVisual = confirmModal ? CARD_VISUALS[confirmModal] : null;

  return (
    <>
      <div className="rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-[0_6px_18px_-12px_rgba(35,26,21,0.1)]">
        <div className="flex items-center gap-2 text-xs font-bold text-[#5E4F43]">
          <Sparkles className="w-4 h-4 text-[#8B5E3C] shrink-0" />
          <span>{t.inventoryTitle}</span>
        </div>

        {privateToggleMode && !cardsRevealed ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-semibold text-[#7A6A5B]">
              {t.singlePhoneCardsLockedHint}
            </span>
            <button
              type="button"
              onClick={() => setCardsRevealed(true)}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>{t.showSecretCardsBtn}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Gold Card — Luminous Amber Gold */}
            <button
              type="button"
              disabled={busy || goldCards < 1 || !canUseGoldOrSwitch}
              onClick={() => setConfirmModal('gold')}
              title={t.goldCardDesc}
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap ${
                goldCards > 0 && canUseGoldOrSwitch
                  ? CARD_VISUALS.gold.btnActive
                  : goldCards > 0
                    ? CARD_VISUALS.gold.btnPassive
                    : CARD_VISUALS.gold.btnEmpty
              }`}
            >
              <Crown
                className={`w-3.5 h-3.5 shrink-0 ${
                  goldCards > 0 ? CARD_VISUALS.gold.iconColor : 'text-[#9C8D7E]'
                }`}
              />
              <span>{t.goldCardName}</span>
              <span
                className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  goldCards > 0
                    ? CARD_VISUALS.gold.countBadgeActive
                    : 'bg-[#231A15]/10 text-[#6E5E50]'
                }`}
              >
                {goldCards}
              </span>
            </button>

            {/* Switch Card — Vivid Electric Cobalt Blue */}
            <button
              type="button"
              disabled={busy || switchCards < 1 || !canUseGoldOrSwitch || otherPlayers.length === 0}
              onClick={() => {
                setSelectedTargetUid(otherPlayers[0]?.uid ?? '');
                setConfirmModal('switch');
              }}
              title={t.switchCardDesc}
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap ${
                switchCards > 0 && canUseGoldOrSwitch && otherPlayers.length > 0
                  ? CARD_VISUALS.switch.btnActive
                  : switchCards > 0
                    ? CARD_VISUALS.switch.btnPassive
                    : CARD_VISUALS.switch.btnEmpty
              }`}
            >
              <ArrowLeftRight
                className={`w-3.5 h-3.5 shrink-0 ${
                  switchCards > 0 ? CARD_VISUALS.switch.iconColor : 'text-[#9C8D7E]'
                }`}
              />
              <span>{t.switchCardName}</span>
              <span
                className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  switchCards > 0
                    ? CARD_VISUALS.switch.countBadgeActive
                    : 'bg-[#231A15]/10 text-[#6E5E50]'
                }`}
              >
                {switchCards}
              </span>
            </button>

            {/* Anti-Switch Card — Bold Ruby Crimson */}
            <button
              type="button"
              disabled={busy || antiSwitchCards < 1 || !canUseAntiSwitch}
              onClick={() => setConfirmModal('anti_switch')}
              title={t.antiSwitchCardDesc}
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap ${
                antiSwitchCards > 0 && canUseAntiSwitch
                  ? CARD_VISUALS.anti_switch.btnActive
                  : antiSwitchCards > 0
                    ? CARD_VISUALS.anti_switch.btnPassive
                    : CARD_VISUALS.anti_switch.btnEmpty
              }`}
            >
              <Shield
                className={`w-3.5 h-3.5 shrink-0 ${
                  antiSwitchCards > 0 ? CARD_VISUALS.anti_switch.iconColor : 'text-[#9C8D7E]'
                }`}
              />
              <span>{t.antiSwitchCardName}</span>
              <span
                className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  antiSwitchCards > 0
                    ? CARD_VISUALS.anti_switch.countBadgeActive
                    : 'bg-[#231A15]/10 text-[#6E5E50]'
                }`}
              >
                {antiSwitchCards}
              </span>
            </button>

            {privateToggleMode && (
              <button
                type="button"
                onClick={() => setCardsRevealed(false)}
                className="min-h-[38px] px-2.5 rounded-xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] text-xs font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
                <span>{t.hideSecretCardsBtn}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {confirmModal && activeModalVisual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#231A15]/55 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md rounded-3xl ${activeModalVisual.surface} border-2 ${activeModalVisual.border} p-6 space-y-5 shadow-2xl`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${activeModalVisual.iconBox}`}
                  >
                    {confirmModal === 'gold' ? (
                      <Crown className="w-5 h-5" />
                    ) : confirmModal === 'switch' ? (
                      <ArrowLeftRight className="w-5 h-5" />
                    ) : (
                      <Shield className="w-5 h-5" />
                    )}
                  </div>
                  <h3 className={`text-lg font-extrabold ${activeModalVisual.titleColor}`}>
                    {confirmModal === 'gold'
                      ? t.goldCardName
                      : confirmModal === 'switch'
                        ? t.selectSwitchTargetTitle
                        : t.confirmUseAntiSwitchTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="p-1.5 rounded-xl bg-white/75 text-[#5E4F43] hover:text-[#231A15] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {confirmModal === 'gold' && (
                <p className="text-sm text-[#4A3D33] leading-relaxed font-medium">
                  {t.confirmUseGoldDesc}
                </p>
              )}

              {confirmModal === 'anti_switch' && (
                <p className="text-sm text-[#4A3D33] leading-relaxed font-medium">
                  {t.confirmUseAntiSwitchDesc}
                </p>
              )}

              {confirmModal === 'switch' && (
                <div className="space-y-3">
                  <p className="text-sm text-[#4A3D33] font-medium">{t.selectSwitchTargetDesc}</p>
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {otherPlayers.map((p) => {
                      const selected = selectedTargetUid === p.uid;
                      return (
                        <button
                          key={p.uid}
                          type="button"
                          onClick={() => setSelectedTargetUid(p.uid)}
                          className={`w-full p-3 rounded-2xl border flex items-center gap-3 text-start transition cursor-pointer ${
                            selected
                              ? 'bg-[#1D4ED8] border-[#1E3A8A] text-white shadow-sm'
                              : 'bg-white/90 border-[#BFDBFE] text-[#1E3A8A] hover:bg-white'
                          }`}
                        >
                          <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="sm" />
                          <span className="font-bold text-sm truncate">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 min-h-[44px] rounded-2xl bg-white/85 hover:bg-white border border-[#D5C7B2] text-[#231A15] font-bold text-sm cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="button"
                  disabled={busy || (confirmModal === 'switch' && !selectedTargetUid)}
                  onClick={
                    confirmModal === 'gold'
                      ? handleConfirmGold
                      : confirmModal === 'switch'
                        ? handleConfirmSwitch
                        : handleConfirmAntiSwitch
                  }
                  className={`flex-1 min-h-[44px] rounded-2xl font-extrabold text-sm cursor-pointer disabled:opacity-50 shadow-sm ${activeModalVisual.confirmBtn}`}
                >
                  {t.confirmBtn}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

interface CardRewardOverlayProps {
  visible: boolean;
  cardId: string | null;
  recipientName: string;
  onContinue: () => void;
  requireTapToReveal?: boolean;
  onReveal?: () => void;
}

export const CardRewardOverlay: React.FC<CardRewardOverlayProps> = ({
  visible,
  cardId,
  recipientName,
  onContinue,
  requireTapToReveal = false,
  onReveal,
}) => {
  const { t } = useApp();
  const [revealed, setRevealed] = useState<boolean>(!requireTapToReveal);

  useEffect(() => {
    if (visible) {
      setRevealed(!requireTapToReveal);
    }
  }, [visible, cardId, requireTapToReveal]);

  if (!visible || !cardId) return null;

  const type: SpecialCardType = getCardTypeFromId(cardId);
  const visual = CARD_VISUALS[type];
  const cardName =
    type === 'gold'
      ? t.goldCardName
      : type === 'switch'
        ? t.switchCardName
        : t.antiSwitchCardName;
  const cardDesc =
    type === 'gold'
      ? t.goldCardDesc
      : type === 'switch'
        ? t.switchCardDesc
        : t.antiSwitchCardDesc;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#1B130F]/75 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden"
      >
        {requireTapToReveal && !revealed ? (
          <motion.div
            key="privacy-shield"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className="w-full max-w-md rounded-3xl bg-[#231A15] border-2 border-[#D7BD7B] p-6 sm:p-8 text-center space-y-5 shadow-2xl text-[#FFFDF9]"
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-[#3A2C24] border border-[#D7BD7B] flex items-center justify-center text-[#FDE68A]">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-[#D7BD7B]">
                {t.secretCardPrivateBadge}
              </p>
              <h2 className="text-2xl font-extrabold text-[#FFFDF9]">
                {t.secretCardTapToRevealTitle} {recipientName}
              </h2>
              <p className="text-sm text-[#DDD2C0] leading-relaxed">{t.secretCardPrivacyHint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRevealed(true);
                onReveal?.();
              }}
              className="w-full min-h-[52px] rounded-2xl bg-[#F59E0B] hover:bg-[#D97706] text-[#231A15] font-extrabold text-base flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
            >
              <Eye className="w-5 h-5" />
              <span>{t.secretCardRevealBtn}</span>
            </button>
          </motion.div>
        ) : (
          <div
            className="relative flex items-center justify-center w-full max-w-md"
            style={{ perspective: 1200 }}
          >
            {/* Pulsing Aura Halo */}
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [1, 1.16, 1], opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-80 h-80 rounded-full blur-3xl pointer-events-none"
              style={{ backgroundColor: visual.glowRgba }}
            />

            {/* Rotating Sunburst Rays */}
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1.05, opacity: 0.85, rotate: 360 }}
              transition={{
                scale: { duration: 0.45, ease: 'easeOut' },
                opacity: { duration: 0.45 },
                rotate: { duration: 16, repeat: Infinity, ease: 'linear' },
              }}
              className="absolute w-96 h-96 rounded-full pointer-events-none"
              style={{
                background: `repeating-conic-gradient(from 0deg, ${visual.rayColor} 0deg 14deg, transparent 14deg 30deg)`,
                maskImage: 'radial-gradient(circle, black 34%, transparent 72%)',
                WebkitMaskImage: 'radial-gradient(circle, black 34%, transparent 72%)',
              }}
            />

            {/* Radiating Sparkle / Confetti Particles */}
            {BURST_PARTICLES.map((p, idx) => (
              <motion.span
                key={`spark-${cardId}-${p.id}`}
                aria-hidden="true"
                initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                animate={{ x: p.x, y: p.y, scale: [0, 1.25, 0.2], opacity: [1, 1, 0] }}
                transition={{ duration: 0.95, delay: 0.14 + p.delay, ease: 'easeOut' }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: visual.particleColors[idx % visual.particleColors.length],
                }}
              />
            ))}

            {/* 3D Flip + Spring Card */}
            <motion.div
              key={`card-reveal-${cardId}`}
              initial={{ rotateY: 165, scale: 0.55, y: 36, opacity: 0 }}
              animate={{ rotateY: 0, scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 16, stiffness: 210, mass: 0.85 }}
              style={{ transformStyle: 'preserve-3d' }}
              className={`relative w-full rounded-3xl ${visual.surface} border-2 ${visual.border} p-6 sm:p-8 text-center space-y-5 shadow-2xl overflow-hidden`}
            >
              {/* Metallic Diagonal Shimmer Sweep */}
              <motion.div
                aria-hidden="true"
                initial={{ x: '-140%' }}
                animate={{ x: '240%' }}
                transition={{ duration: 1.15, delay: 0.35, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent"
              />

              <div className="relative z-10 space-y-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/80 border border-black/10 text-[11px] font-extrabold text-[#231A15]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.secretCardPrivateBadge}</span>
                </div>

                <motion.div
                  initial={{ scale: 0.6, rotate: -14 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', delay: 0.2, damping: 12, stiffness: 240 }}
                  className={`mx-auto w-20 h-20 rounded-3xl border-2 flex items-center justify-center shadow-lg ${visual.iconBox}`}
                >
                  {type === 'gold' ? (
                    <Crown className="w-10 h-10" />
                  ) : type === 'switch' ? (
                    <ArrowLeftRight className="w-10 h-10" />
                  ) : (
                    <Shield className="w-10 h-10" />
                  )}
                </motion.div>

                <div className="space-y-2">
                  <p className={`text-xs font-extrabold uppercase tracking-wider ${visual.iconColor}`}>
                    {recipientName} · {t.specialCardRewardTitle}
                  </p>
                  <h2 className={`text-2xl sm:text-3xl font-extrabold ${visual.titleColor}`}>
                    {cardName}
                  </h2>
                  <p className="text-sm text-[#3A2C24] leading-relaxed font-medium pt-1">
                    {cardDesc}
                  </p>
                  <p className="text-xs text-[#5E4F43] pt-1 font-semibold">
                    {t.specialCardRewardSub}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onContinue}
                  className={`w-full min-h-[52px] rounded-2xl font-extrabold text-base transition cursor-pointer shadow-md ${visual.confirmBtn}`}
                >
                  {t.collectAndContinue}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export const CardEventBanner: React.FC<{ event: CardEvent | null }> = ({ event }) => {
  const { t } = useApp();
  // STRICT PRIVACY: never broadcast card awards publicly to other players
  if (!event || event.type === 'awarded') return null;

  let text = '';
  let badgeStyle = CARD_VISUALS.gold.banner;
  if (event.type === 'gold') {
    text = `${event.actorName} ${t.cardEventGold}`;
    badgeStyle = CARD_VISUALS.gold.banner;
  } else if (event.type === 'switch') {
    text = `${event.actorName} ${t.cardEventSwitch} ${event.targetName ?? ''}`;
    badgeStyle = CARD_VISUALS.switch.banner;
  } else if (event.type === 'anti_switch') {
    text = `${event.actorName} ${t.cardEventAntiSwitch} ${event.targetName ?? ''}`;
    badgeStyle = CARD_VISUALS.anti_switch.banner;
  }

  return (
    <motion.div
      key={`evt-${event.nonce}-${event.type}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 px-4 py-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-xs ${badgeStyle}`}
    >
      {event.type === 'gold' ? (
        <Crown className="w-4 h-4 shrink-0" />
      ) : event.type === 'switch' ? (
        <ArrowLeftRight className="w-4 h-4 shrink-0" />
      ) : (
        <Shield className="w-4 h-4 shrink-0" />
      )}
      <span className="truncate">{text}</span>
    </motion.div>
  );
};

export const TurnModeNotice: React.FC<{
  turnMode: TurnMode;
  turnQuestionsRemaining: number;
  switchSourceName?: string;
}> = ({ turnMode, turnQuestionsRemaining, switchSourceName }) => {
  const { t } = useApp();
  if (turnMode === 'switch_pending') {
    return (
      <div className="rounded-xl bg-[#DBEAFE] border-2 border-[#2563EB] px-3.5 py-2 text-xs font-extrabold text-[#1E3A8A] flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 shrink-0" />
        <span>
          {t.switchedToYouBadge}: {switchSourceName ?? '...'}
        </span>
      </div>
    );
  }
  if (turnMode === 'anti_switch_forced') {
    return (
      <div className="rounded-xl bg-[#FEE2E2] border-2 border-[#DC2626] px-3.5 py-2 text-xs font-extrabold text-[#7F1D1D] flex items-center gap-2">
        <Shield className="w-4 h-4 shrink-0" />
        <span>
          {t.antiSwitchForcedBadge} · {t.cannotRefuseHint}
        </span>
      </div>
    );
  }
  if (turnQuestionsRemaining === 2) {
    return (
      <div className="rounded-xl bg-[#FEF3C7] border border-[#D97706] px-3.5 py-2 text-xs font-extrabold text-[#78350F]">
        {t.doublePenaltyActiveBadge} · {t.questionOneOfTwo}
      </div>
    );
  }
  return null;
};

interface RoundResultsModalProps {
  visible: boolean;
  completedRound: number | null;
  totalRounds: number;
  gameMode: GameLengthMode;
  players: Array<{
    uid: string;
    name: string;
    avatarColor?: string;
    score: number;
    skipsRemaining?: number;
  }>;
  showSkips?: boolean;
  onContinue: () => void;
}

export const RoundResultsModal: React.FC<RoundResultsModalProps> = ({
  visible,
  completedRound,
  totalRounds,
  gameMode,
  players,
  showSkips = false,
  onContinue,
}) => {
  const { t } = useApp();
  if (!visible || !completedRound) return null;

  const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const nextRound = completedRound + 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#231A15]/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.92, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 250 }}
          className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border-2 border-[#C8B9A3] p-6 space-y-5 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FEF3C7] border border-[#D97706] flex items-center justify-center text-[#B45309] shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold text-[#231A15] truncate">
                {t.roundSummaryTitle} {completedRound}
              </h2>
              <p className="text-xs font-semibold text-[#6E5E50]">
                {gameMode === 'all_questions'
                  ? t.roundSummaryAllQuestionsSub
                  : `${t.roundSummaryNextLabel}: ${t.roundLabel} ${nextRound} ${t.ofLabel} ${totalRounds}`}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-[#EFE6D6] max-h-72 overflow-y-auto rounded-2xl bg-[#FBF7F0] border border-[#DDD2C0] px-3.5 py-1">
            {sorted.map((p, idx) => {
              const isLeader = idx === 0;
              return (
                <li
                  key={p.uid}
                  className={`py-2.5 flex items-center justify-between gap-2.5 ${
                    isLeader ? 'text-[#78350F]' : 'text-[#231A15]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 text-xs font-mono-tabular font-extrabold text-center ${
                        isLeader ? 'text-[#B45309]' : 'text-[#8B5E3C]'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <PlayerAvatar name={p.name} paletteId={p.avatarColor} size="sm" active={isLeader} />
                    <span className="text-sm font-extrabold truncate">{p.name}</span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 font-mono-tabular text-xs font-extrabold">
                    <span
                      dir="ltr"
                      className={(p.score ?? 0) < 0 ? 'text-[#9B3B30]' : 'text-[#4A6B46]'}
                    >
                      {p.score ?? 0} {t.pointsUnit}
                    </span>
                    {showSkips && typeof p.skipsRemaining === 'number' && (
                      <span className="text-[#8B5E3C]">{p.skipsRemaining}/3</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={onContinue}
            className="w-full min-h-[48px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-sm sm:text-base transition cursor-pointer shadow-md"
          >
            {t.continueNextRoundBtn}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
