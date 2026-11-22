import React, { useState } from 'react';
import { ArrowLeftRight, Shield, Sparkles, Trophy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import type { CardEvent, SpecialCardType, TurnMode } from '../types/game';
import { getCardTypeFromId } from '../utils/specialCards';
import { PlayerAvatar } from './PlayerAvatar';

export interface SelectablePlayer {
  uid: string;
  name: string;
  avatarColor: string;
}

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
  remainingDeckCards: number;
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
  remainingDeckCards,
}) => {
  const { t } = useApp();
  const [confirmModal, setConfirmModal] = useState<'gold' | 'switch' | 'anti_switch' | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string>('');

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

  return (
    <>
      <div className="rounded-2xl bg-[#FFFDF9] border border-[#DDD2C0] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-[0_6px_18px_-12px_rgba(35,26,21,0.1)]">
        <div className="flex items-center gap-2 text-xs font-bold text-[#5E4F43]">
          <Sparkles className="w-4 h-4 text-[#8B5E3C] shrink-0" />
          <span>{t.inventoryTitle}</span>
          <span className="text-[11px] font-semibold text-[#7A6A5B] tabular-nums">
            ({t.cardsRemainingDeck}: {remainingDeckCards}/5)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Gold Card */}
          <button
            type="button"
            disabled={busy || goldCards < 1 || !canUseGoldOrSwitch}
            onClick={() => setConfirmModal('gold')}
            title={t.goldCardDesc}
            className={`min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
              goldCards > 0 && canUseGoldOrSwitch
                ? 'bg-[#FBF5E4] border-[#C7A355] text-[#7D5D18] hover:bg-[#F5E9C6] cursor-pointer shadow-xs'
                : goldCards > 0
                  ? 'bg-[#FBF5E4]/65 border-[#DFCFA5] text-[#8C6820] cursor-default'
                  : 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-[#9A7426] shrink-0" />
            <span>{t.goldCardName}</span>
            <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-[#231A15]/10 text-[#231A15]">
              {goldCards}
            </span>
          </button>

          {/* Switch Card */}
          <button
            type="button"
            disabled={busy || switchCards < 1 || !canUseGoldOrSwitch || otherPlayers.length === 0}
            onClick={() => {
              setSelectedTargetUid(otherPlayers[0]?.uid ?? '');
              setConfirmModal('switch');
            }}
            title={t.switchCardDesc}
            className={`min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
              switchCards > 0 && canUseGoldOrSwitch && otherPlayers.length > 0
                ? 'bg-[#EFECE4] border-[#8D8879] text-[#3F3B32] hover:bg-[#E4DFD3] cursor-pointer shadow-xs'
                : switchCards > 0
                  ? 'bg-[#EFECE4]/70 border-[#CCC6B8] text-[#5C584E] cursor-default'
                  : 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#5C584E] shrink-0" />
            <span>{t.switchCardName}</span>
            <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-[#231A15]/10 text-[#231A15]">
              {switchCards}
            </span>
          </button>

          {/* Anti-Switch Card */}
          <button
            type="button"
            disabled={busy || antiSwitchCards < 1 || !canUseAntiSwitch}
            onClick={() => setConfirmModal('anti_switch')}
            title={t.antiSwitchCardDesc}
            className={`min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
              antiSwitchCards > 0 && canUseAntiSwitch
                ? 'bg-[#F9EAE6] border-[#B45E4D] text-[#843B2E] hover:bg-[#F3DDD7] cursor-pointer shadow-sm'
                : antiSwitchCards > 0
                  ? 'bg-[#F9EAE6]/65 border-[#DFBDB5] text-[#9B574B] cursor-default'
                  : 'bg-[#F6EFE3] border-[#E5DAC8] text-[#9C8D7E] cursor-default'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#8F4A3B] shrink-0" />
            <span>{t.antiSwitchCardName}</span>
            <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-[#231A15]/10 text-[#231A15]">
              {antiSwitchCards}
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {confirmModal && (
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
              className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border-2 border-[#D5C7B2] p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-[#231A15]">
                  {confirmModal === 'gold'
                    ? t.goldCardName
                    : confirmModal === 'switch'
                      ? t.selectSwitchTargetTitle
                      : t.confirmUseAntiSwitchTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="p-1.5 rounded-xl bg-[#EFE6D6] text-[#5E4F43] hover:text-[#231A15] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {confirmModal === 'gold' && (
                <p className="text-sm text-[#5E4F43] leading-relaxed">{t.confirmUseGoldDesc}</p>
              )}

              {confirmModal === 'anti_switch' && (
                <p className="text-sm text-[#5E4F43] leading-relaxed">{t.confirmUseAntiSwitchDesc}</p>
              )}

              {confirmModal === 'switch' && (
                <div className="space-y-3">
                  <p className="text-sm text-[#5E4F43]">{t.selectSwitchTargetDesc}</p>
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
                              ? 'bg-[#231A15] border-[#231A15] text-[#FBF7F0]'
                              : 'bg-[#FBF7F0] border-[#DDD2C0] text-[#231A15] hover:bg-[#F3EBDD]'
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
                  className="flex-1 min-h-[44px] rounded-2xl bg-[#EFE6D6] hover:bg-[#E5DAC5] border border-[#D5C7B2] text-[#231A15] font-bold text-sm cursor-pointer"
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
                  className="flex-1 min-h-[44px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-sm cursor-pointer disabled:opacity-50"
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
}

export const CardRewardOverlay: React.FC<CardRewardOverlayProps> = ({
  visible,
  cardId,
  recipientName,
  onContinue,
}) => {
  const { t } = useApp();
  if (!visible || !cardId) return null;

  const type: SpecialCardType = getCardTypeFromId(cardId);
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

  const accent =
    type === 'gold'
      ? 'bg-[#FBF5E4] border-[#C7A355]'
      : type === 'switch'
        ? 'bg-[#EFECE4] border-[#8D8879]'
        : 'bg-[#F9EAE6] border-[#C88172]';

  const iconTint =
    type === 'gold'
      ? 'text-[#9A7426] bg-[#FFFDF9] border-[#D7BD7B]'
      : type === 'switch'
        ? 'text-[#4A463B] bg-[#FFFDF9] border-[#BDB6A8]'
        : 'text-[#8F4A3B] bg-[#FFFDF9] border-[#D9A79D]';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#231A15]/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.88, rotate: -2, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 260 }}
          className={`w-full max-w-md rounded-3xl ${accent} border-2 p-6 sm:p-8 text-center space-y-5 shadow-2xl`}
        >
          <div className={`mx-auto w-16 h-16 rounded-3xl border flex items-center justify-center ${iconTint}`}>
            {type === 'gold' ? (
              <Trophy className="w-9 h-9" />
            ) : type === 'switch' ? (
              <ArrowLeftRight className="w-9 h-9" />
            ) : (
              <Shield className="w-9 h-9" />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#8B5E3C]">
              {recipientName} · {t.specialCardRewardTitle}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#231A15]">{cardName}</h2>
            <p className="text-sm text-[#4A3D33] leading-relaxed pt-1">{cardDesc}</p>
            <p className="text-xs text-[#6E5E50] pt-1">{t.specialCardRewardSub}</p>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="w-full min-h-[50px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-extrabold text-base transition cursor-pointer shadow-md"
          >
            {t.collectAndContinue}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export const CardEventBanner: React.FC<{ event: CardEvent | null }> = ({ event }) => {
  const { t } = useApp();
  if (!event) return null;

  let text = '';
  let badgeStyle = 'bg-[#F3EBDD] border-[#D5C7B2] text-[#231A15]';
  if (event.type === 'awarded') {
    const cardType = getCardTypeFromId(event.cardId);
    const label =
      cardType === 'gold'
        ? t.goldCardName
        : cardType === 'switch'
          ? t.switchCardName
          : t.antiSwitchCardName;
    text = `${event.actorName}: ${t.cardEventAwarded} (${label})`;
    badgeStyle = 'bg-[#FBF5E4] border-[#C7A355] text-[#7D5D18]';
  } else if (event.type === 'gold') {
    text = `${event.actorName} ${t.cardEventGold}`;
    badgeStyle = 'bg-[#FBF5E4] border-[#C7A355] text-[#7D5D18]';
  } else if (event.type === 'switch') {
    text = `${event.actorName} ${t.cardEventSwitch} ${event.targetName ?? ''}`;
    badgeStyle = 'bg-[#EFECE4] border-[#A8A294] text-[#4A463B]';
  } else if (event.type === 'anti_switch') {
    text = `${event.actorName} ${t.cardEventAntiSwitch} ${event.targetName ?? ''}`;
    badgeStyle = 'bg-[#F9EAE6] border-[#C88172] text-[#843B2E]';
  }

  return (
    <motion.div
      key={`evt-${event.nonce}-${event.type}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold flex items-center gap-2 ${badgeStyle}`}
    >
      <Sparkles className="w-4 h-4 shrink-0" />
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
      <div className="rounded-xl bg-[#EFECE4] border border-[#A8A294] px-3.5 py-2 text-xs font-bold text-[#4A463B] flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 shrink-0" />
        <span>
          {t.switchedToYouBadge}: {switchSourceName ?? '...'}
        </span>
      </div>
    );
  }
  if (turnMode === 'anti_switch_forced') {
    return (
      <div className="rounded-xl bg-[#F9EAE6] border border-[#C88172] px-3.5 py-2 text-xs font-bold text-[#843B2E] flex items-center gap-2">
        <Shield className="w-4 h-4 shrink-0" />
        <span>
          {t.antiSwitchForcedBadge} · {t.cannotRefuseHint}
        </span>
      </div>
    );
  }
  if (turnQuestionsRemaining === 2) {
    return (
      <div className="rounded-xl bg-[#FBF5E4] border border-[#C7A355] px-3.5 py-2 text-xs font-bold text-[#7D5D18]">
        {t.doublePenaltyActiveBadge} · {t.questionOneOfTwo}
      </div>
    );
  }
  return null;
};
