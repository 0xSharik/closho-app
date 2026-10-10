import { useSettingsStore } from '../store/settingsStore';
import { CartItem } from '../store/cartStore';

/**
 * Default fallback fee when settings are not loaded.
 * Real fees and rules are fetched from GET /settings/config.
 */
export const DEFAULT_SHIPPING_FEE = 0;

export const getShippingFee = (
  items: CartItem[] = [],
  pastOrdersCount: number = 0
): number => {
  const calculation = useSettingsStore.getState().calculateDeliveryCharge(items, pastOrdersCount);
  return calculation.totalDeliveryCharge;
};
