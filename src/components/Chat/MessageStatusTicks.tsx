import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { MessageStatus } from '../../types/chat';

export interface MessageStatusTicksProps {
  /** Authoritative status field stored on the Firebase document */
  status?: MessageStatus;
  /** Optional list of UIDs that have read the message in Firebase */
  readBy?: string[];
  /** Optional list of UIDs that have received the message in Firebase */
  deliveredTo?: string[];
  /** Sender UID (excluded when checking recipient readBy / deliveredTo entries) */
  senderId?: string;
  /** Specific direct-chat recipient UID when checking 1-on-1 receipts */
  recipientId?: string;
  /** 'bubble' renders high-contrast icons for outgoing bubbles; 'inbox' renders muted icons for inbox lists */
  variant?: 'bubble' | 'inbox';
  className?: string;
}

/**
 * Resolves the canonical receipt state ('sent' | 'delivered' | 'read') strictly from Firebase fields.
 */
export function resolveFirebaseMessageStatus({
  status,
  readBy,
  deliveredTo,
  senderId,
  recipientId
}: Pick<
  MessageStatusTicksProps,
  'status' | 'readBy' | 'deliveredTo' | 'senderId' | 'recipientId'
>): MessageStatus {
  const hasRecipientRead = Array.isArray(readBy)
    ? recipientId
      ? readBy.includes(recipientId)
      : readBy.some((uid) => uid !== senderId)
    : false;

  if (status === 'read' || hasRecipientRead) {
    return 'read';
  }

  const hasRecipientDelivered = Array.isArray(deliveredTo)
    ? recipientId
      ? deliveredTo.includes(recipientId)
      : deliveredTo.some((uid) => uid !== senderId)
    : false;

  if (status === 'delivered' || hasRecipientDelivered) {
    return 'delivered';
  }

  return status || 'sent';
}

/**
 * Visual status indicator for chat bubbles and inbox previews:
 * - Single tick: sent (stored in Firebase, not yet delivered)
 * - Double tick: delivered (acknowledged in Firebase by recipient device)
 * - Blue double tick: read (viewed by recipient and marked read in Firebase)
 */
export const MessageStatusTicks: React.FC<MessageStatusTicksProps> = ({
  status,
  readBy,
  deliveredTo,
  senderId,
  recipientId,
  variant = 'bubble',
  className = ''
}) => {
  const resolvedStatus = resolveFirebaseMessageStatus({
    status,
    readBy,
    deliveredTo,
    senderId,
    recipientId
  });

  if (resolvedStatus === 'read') {
    const colorClass =
      variant === 'inbox'
        ? 'text-sky-500 dark:text-sky-400'
        : 'text-sky-400 dark:text-sky-300';

    return (
      <span
        className={`inline-flex items-center shrink-0 ${className}`}
        title="Read"
        aria-label="Read"
        data-status="read"
      >
        <CheckCheck className={`w-3.5 h-3.5 stroke-[2.5] ${colorClass}`} />
      </span>
    );
  }

  if (resolvedStatus === 'delivered') {
    const colorClass =
      variant === 'inbox'
        ? 'text-slate-400 dark:text-slate-500'
        : 'text-slate-300 dark:text-emerald-100/80';

    return (
      <span
        className={`inline-flex items-center shrink-0 ${className}`}
        title="Delivered"
        aria-label="Delivered"
        data-status="delivered"
      >
        <CheckCheck className={`w-3.5 h-3.5 stroke-[2] ${colorClass}`} />
      </span>
    );
  }

  const sentColorClass =
    variant === 'inbox'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-400 dark:text-emerald-200/75';

  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      title="Sent"
      aria-label="Sent"
      data-status="sent"
    >
      <Check className={`w-3.5 h-3.5 stroke-[2] ${sentColorClass}`} />
    </span>
  );
};
