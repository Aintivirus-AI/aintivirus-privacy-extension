/**
 * AINTIVIRUS Popup Components
 * 
 * Re-exports all popup components for easy importing.
 */

// Existing components
export { ConnectedSites } from './ConnectedSites';
export { PendingRequests } from './PendingRequests';

// Premium UI Components (Polish Pass - Phase 1)
// ============================================

// Address Display
export { AddressChip, type AddressChipProps } from './AddressChip';

// Chain & Status Indicators
export { ChainPill, type ChainPillProps } from './ChainPill';
export { StatusChip, type StatusChipProps, type StatusType } from './StatusChip';

// Empty States
export { EmptyState, EmptyStatePreset, type EmptyStateProps } from './EmptyState';

// Progressive Disclosure
export { 
  DetailsAccordion, 
  DetailsRow, 
  DetailsCodeBlock, 
  type DetailsAccordionProps, 
  type DetailsRowProps, 
  type DetailsCodeBlockProps 
} from './DetailsAccordion';

// Flow Layouts
export { StickyBottomCTA, type StickyBottomCTAProps } from './StickyBottomCTA';
export { ReviewScreen, type ReviewScreenProps, type ReviewState } from './ReviewScreen';

// Undo System
export { UndoProvider, useUndo, type UndoAction, type UndoContextValue } from './UndoToast';

// Activity
export { ActivityRow, type ActivityRowProps, type ActivityAction } from './ActivityRow';

// Refresh Indicator
export { RefreshIndicator, type RefreshIndicatorProps } from './RefreshIndicator';

// EVM Transaction Controls
export { GasSettingsPanel, type GasSettings, type GasSettingsPanelProps, type GasPreset } from './GasSettingsPanel';
export { PendingTxList, type PendingTxListProps } from './PendingTxList';
export { SpeedUpModal, type SpeedUpModalProps } from './SpeedUpModal';
export { CancelModal, type CancelModalProps } from './CancelModal';
export { TxDetailsDrawer, type TxDetailsDrawerProps } from './TxDetailsDrawer';

// Explorer Links
export { ExplorerLinkIcon, type ExplorerLinkIconProps } from './ExplorerLinkIcon';

// Recent Recipients
export { RecentRecipientsDropdown } from './RecentRecipientsDropdown';

// Transaction Status Components
export { TxStatusBadge, TxStatusDot, type TxStatusBadgeProps, type TxStatusDotProps } from './TxStatusBadge';
export { TxConfirmationProgress, TxProgressIndicator, type TxConfirmationProgressProps, type TxProgressIndicatorProps } from './TxConfirmationProgress';

// Skeleton Loading Components
export {
  Skeleton,
  SkeletonText,
  SkeletonGroup,
  SkeletonWalletBalance,
  SkeletonTokenItem,
  SkeletonTxItem,
  SkeletonStatCard,
  SkeletonFeatureItem,
  SkeletonConnectedSite,
  SkeletonAllowanceCard,
  SkeletonPendingTx,
  SkeletonAddress,
  SkeletonWalletView,
  SkeletonSecurityStats,
  type SkeletonProps,
  type SkeletonTextProps,
  type SkeletonGroupProps,
} from './Skeleton';

// Token Icon with Fallback
export { TokenIcon, default as TokenIconDefault } from './TokenIcon';
