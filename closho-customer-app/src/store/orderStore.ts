import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import api from '../services/api';

export interface OrderItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  size: string;
  colorName: string;
  quantity: number;
  image: string;
}

export interface OrderTimeline {
  status: string;
  date: string;
  completed: boolean;
}

export interface Order {
  id: string;
  orderNumber?: string;
  date: string;
  status: string;
  total: number;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  deliveryCharge?: number;
  trackingNumber?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  itemsCount?: number;
  previewImage?: string;
  items: OrderItem[];
  timeline: OrderTimeline[];
}

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;

  fetchOrders: () => Promise<void>;

  createOrder: (payload: {
    storeId: string;
    addressId: string;
    paymentMethod: string;
    couponCode?: string | null;

    // Checkout pricing
    deliveryFee?: number;
    subtotal?: number;
    discountAmount?: number;
    totalAmount?: number;
  }) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;

  verifyPayment: (payload: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;

  cancelOrder: (
    orderId: string
  ) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
}

// ─── Helper: extract image URL from order item ───────────────────────────────
function extractOrderItemImage(i: any): string {
  return (
    i?.productThumbnail ||
    i?.product?.images?.[0] ||
    i?.product?.thumbnail ||
    i?.images?.[0] ||
    i?.thumbnail ||
    i?.image ||
    i?.imageUrl ||
    ''
  );
}

// ─── Helper: extract price from order item ───────────────────────────────────
function extractOrderItemPrice(i: any): number {
  return Number(i?.unitPrice ?? i?.price ?? i?.product?.price ?? 0);
}

// ─── Fetch image from the existing product API ───────────────────────────────
async function fetchProductImage(
  productId?: string,
  storeId?: string
): Promise<string> {
  if (!productId) {
    console.log('[ORDERS IMAGE] No productId');
    return '';
  }

  try {
    const url = storeId
      ? `/products/${productId}?storeId=${storeId}`
      : `/products/${productId}`;

    console.log('[ORDERS IMAGE] Fetching product:', url);

    const response = await api.get(url);

    const product =
      response.data?.data !== undefined
        ? response.data.data
        : response.data;

    const image =
      product?.images?.[0] ||
      product?.thumbnail ||
      '';

    console.log(
      '[ORDERS IMAGE] Product:',
      productId,
      '| image:',
      image || 'NONE'
    );

    return typeof image === 'string' ? image : '';
  } catch (error: any) {
    console.warn(
      '[ORDERS IMAGE] Failed for product:',
      productId,
      '|',
      error?.response?.data?.message || error?.message || error
    );

    return '';
  }
}


function shouldShowCustomerOrder(order: any): boolean {
  const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
  const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
  const status = String(order?.status || '').toLowerCase();

  const isOnlinePayment =
    paymentMethod === 'razorpay' ||
    paymentMethod === 'card' ||
    paymentMethod === 'upi';

  if (!isOnlinePayment) {
    return true;
  }

  const paidStatuses = new Set([
    'paid',
    'captured',
    'success',
    'successful',
    'completed',
  ]);

  // Online orders are customer orders only after payment succeeds.
  // Pending/failed/cancelled payment attempts must not appear in My Orders.
  if (!paidStatuses.has(paymentStatus)) {
    console.log(
      '[ORDERS] Hiding unpaid online payment attempt:',
      order?.id,
      '| status:',
      status,
      '| paymentStatus:',
      paymentStatus
    );
    return false;
  }

  return true;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      isLoading: false,
      error: null,

      fetchOrders: async () => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.get(
            '/orders?status=all&page=1&limit=50'
          );

          console.log('[ORDERS] === FETCH ORDERS RAW RESPONSE ===');
          console.log(
            '[ORDERS] response.data.success:',
            response.data.success
          );
          console.log(
            '[ORDERS] response.data.data type:',
            typeof response.data.data,
            Array.isArray(response.data.data) ? '(array)' : ''
          );

          if (response.data.success && response.data.data) {
            const raw = response.data.data;

            if (Array.isArray(raw)) {
              console.log(
                '[ORDERS] data is array, length:',
                raw.length
              );

              if (raw.length > 0) {
                console.log(
                  '[ORDERS] First order keys:',
                  Object.keys(raw[0])
                );
              }
            } else {
              console.log(
                '[ORDERS] data keys:',
                Object.keys(raw)
              );

              const nested =
                raw.orders ||
                raw.items ||
                raw.data ||
                [];

              console.log(
                '[ORDERS] nested array length:',
                nested.length
              );

              if (nested.length > 0) {
                console.log(
                  '[ORDERS] First order keys:',
                  Object.keys(nested[0])
                );
              }
            }

            const rawOrders: any[] = Array.isArray(raw)
              ? raw
              : raw.orders ?? raw.items ?? raw.data ?? [];

            const visibleOrders = rawOrders.filter(shouldShowCustomerOrder);

            console.log(
              '[ORDERS] Total raw orders:',
              rawOrders.length,
              '| visible customer orders:',
              visibleOrders.length
            );

            if (rawOrders.length > 0) {
              console.log(
                '[ORDERS] First order full:',
                JSON.stringify(rawOrders[0], null, 2)
              );

              if (rawOrders[0].items?.length > 0) {
                console.log(
                  '[ORDERS] First order first item full:',
                  JSON.stringify(
                    rawOrders[0].items[0],
                    null,
                    2
                  )
                );
              }
            }

            // Cache product images so multiple orders containing the
            // same product do not trigger duplicate API requests.
            const productImageCache: Record<string, string> = {};

            const getProductImage = async (
              productId?: string,
              storeId?: string
            ): Promise<string> => {
              if (!productId) {
                return '';
              }

              const cacheKey = `${storeId || ''}:${productId}`;

              if (productImageCache[cacheKey] !== undefined) {
                console.log(
                  '[ORDERS IMAGE] Cache hit:',
                  cacheKey
                );

                return productImageCache[cacheKey];
              }

              const image = await fetchProductImage(
                productId,
                storeId
              );

              productImageCache[cacheKey] = image;

              return image;
            };

            const mappedOrders: Order[] = await Promise.all(
              visibleOrders.map(async (o: any) => {
                // Total
                const total = Number(
                  o.totalAmount ??
                  o.amount ??
                  o.total ??
                  o.grandTotal ??
                  0
                );

                const storeId = o.store?.id;

                console.log(
                  '[ORDERS] Processing order:',
                  o.id,
                  '| storeId:',
                  storeId
                );

                // ---------------------------------------------------------
                // Fetch product images for all items
                // ---------------------------------------------------------
                const rawItems = Array.isArray(o.items)
                  ? o.items
                  : [];

                const items: OrderItem[] = await Promise.all(
                  rawItems.map(async (i: any) => {
                    let image = extractOrderItemImage(i);

                    console.log(
                      '[ORDERS IMAGE] Initial image:',
                      image || 'NONE',
                      '| productId:',
                      i.productId
                    );

                    // Orders API currently returns productThumbnail=null.
                    // Use the existing product endpoint as fallback.
                    if (!image && i.productId) {
                      image = await getProductImage(
                        i.productId,
                        storeId
                      );
                    }

                    console.log(
                      '[ORDERS IMAGE] Final image:',
                      image || 'NONE',
                      '| productId:',
                      i.productId
                    );

                    return {
                      id: i.id,
                      productId:
                        i.productId ||
                        i.product?.id,

                      name:
                        i.productName ||
                        i.product?.name ||
                        i.name ||
                        'Unknown Product',

                      price:
                        extractOrderItemPrice(i),

                      size:
                        i.variantSize ||
                        i.variant?.size ||
                        i.size ||
                        'N/A',

                      colorName:
                        i.variantColor ||
                        i.variant?.color ||
                        i.colorName ||
                        i.color ||
                        'Default',

                      quantity:
                        i.quantity || 1,

                      image,
                    };
                  })
                );

                // ---------------------------------------------------------
                // Preview image
                // ---------------------------------------------------------
                const previewImage =
                  items[0]?.image ||
                  o.previewImage ||
                  '';

                const mapped: Order = {
                  id: o.id,

                  orderNumber:
                    o.orderNumber,

                  date: o.createdAt
                    ? new Date(
                      o.createdAt
                    ).toLocaleDateString(
                      'en-GB',
                      {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }
                    )
                    : o.date || 'N/A',

                  status:
                    o.status || 'CONFIRMED',

                  total,

                  subtotal: Number(
                    o.subtotal ??
                    o.subTotal ??
                    o.itemsSubtotal ??
                    0
                  ),

                  discountAmount: Number(
                    o.discountAmount ??
                    o.discount ??
                    0
                  ),

                  deliveryCharge:
                    o.deliveryCharge != null
                      ? Number(o.deliveryCharge)
                      : o.shippingAmount != null
                        ? Number(o.shippingAmount)
                        : o.shippingFee != null
                          ? Number(o.shippingFee)
                          : o.deliveryFee != null
                            ? Number(o.deliveryFee)
                            : 0,

                  shippingAmount:
                    o.deliveryCharge != null
                      ? Number(o.deliveryCharge)
                      : o.shippingAmount != null
                        ? Number(o.shippingAmount)
                        : o.shippingFee != null
                          ? Number(o.shippingFee)
                          : o.deliveryFee != null
                            ? Number(o.deliveryFee)
                            : undefined,

                  paymentMethod:
                    o.paymentMethod ||
                    o.payment?.method ||
                    '',

                  paymentStatus:
                    o.paymentStatus ||
                    o.payment?.status ||
                    '',

                  razorpayOrderId:
                    o.razorpayOrderId ||
                    o.payment?.orderId ||
                    '',

                  razorpayPaymentId:
                    o.razorpayPaymentId ||
                    o.payment?.paymentId ||
                    '',

                  trackingNumber:
                    o.trackingNumber ||
                    o.tracking?.number ||
                    '',

                  itemsCount:
                    items.length,

                  previewImage,

                  items,

                  timeline:
                    o.timeline || [
                      {
                        status: 'Order Placed',
                        date: o.createdAt
                          ? new Date(
                            o.createdAt
                          ).toLocaleString()
                          : 'N/A',
                        completed: true,
                      },
                      {
                        status: 'Processing',
                        date: 'Pending',
                        completed: false,
                      },
                      {
                        status: 'Shipped',
                        date: 'Pending',
                        completed: false,
                      },
                      {
                        status: 'Delivered',
                        date: 'Pending',
                        completed: false,
                      },
                    ],
                };

                console.log(
                  `[ORDERS] Mapped order ${mapped.id}: total=${mapped.total}, items=${mapped.itemsCount}, previewImage="${mapped.previewImage}"`
                );

                console.log(
                  '[ORDERS] Mapped item images:',
                  JSON.stringify(
                    mapped.items.map((item) => ({
                      productId:
                        item.productId,
                      name: item.name,
                      image: item.image,
                    })),
                    null,
                    2
                  )
                );

                return mapped;
              })
            );

            console.log(
              '[ORDERS] === FINAL MAPPED ORDERS ==='
            );

            console.log(
              JSON.stringify(
                mappedOrders.map((order) => ({
                  id: order.id,
                  previewImage:
                    order.previewImage,
                  items: order.items.map(
                    (item) => ({
                      productId:
                        item.productId,
                      image: item.image,
                    })
                  ),
                })),
                null,
                2
              )
            );

            set({
              orders: mappedOrders,
              isLoading: false,
            });
          } else {
            console.warn(
              '[ORDERS] fetchOrders failed:',
              response.data.message
            );

            set({
              error:
                response.data.message ||
                'Failed to fetch orders',
              isLoading: false,
            });
          }
        } catch (error: any) {
          console.warn(
            '[ORDERS] fetchOrders exception:',
            error.message || error
          );

          set({
            error:
              error.message ||
              'Failed to connect to server',
            isLoading: false,
          });
        }
      },

      createOrder: async (payload) => {
        set({
          isLoading: true,
          error: null,
        });

        try {
          const cleanPayload: any = {
            ...payload,
          };

          if (!cleanPayload.couponCode) {
            delete cleanPayload.couponCode;
          }

          console.log(
            '[ORDERS] createOrder payload:',
            JSON.stringify(
              cleanPayload,
              null,
              2
            )
          );

          const response = await api.post(
            '/orders',
            cleanPayload
          );

          console.log(
            '[ORDERS] createOrder response:',
            JSON.stringify(
              response.data,
              null,
              2
            )
          );

          if (response.data.success) {
            const rawData = response.data.data ?? {};
            const paymentData = rawData.payment ?? {};

            // Normalize the backend response so checkout never has to guess
            // whether Razorpay fields are nested or top-level.
            let resolvedOrderId =
              rawData.orderId ??
              rawData.order?.id ??
              rawData.id ??
              null;

            const normalizedRazorpayOrderId =
              rawData.razorpayOrderId ??
              rawData.razorpay_order_id ??
              paymentData.orderId ??
              paymentData.razorpayOrderId ??
              null;

            // Some backend versions return only the Razorpay order id.
            // Resolve the internal Closho order id without putting the
            // unpaid order into Zustand's visible orders list.
            if (!resolvedOrderId && normalizedRazorpayOrderId) {
              try {
                const lookup = await api.get(
                  '/orders?status=all&page=1&limit=50'
                );

                const lookupRaw =
                  lookup.data?.data;

                const lookupOrders: any[] =
                  Array.isArray(lookupRaw)
                    ? lookupRaw
                    : lookupRaw?.orders ??
                    lookupRaw?.items ??
                    lookupRaw?.data ??
                    [];

                const matchingOrder =
                  lookupOrders.find((order: any) => {
                    const orderRazorpayId =
                      order?.razorpayOrderId ||
                      order?.razorpay_order_id ||
                      order?.payment?.orderId ||
                      order?.payment?.razorpayOrderId ||
                      '';

                    return orderRazorpayId === normalizedRazorpayOrderId;
                  });

                resolvedOrderId =
                  matchingOrder?.id ?? null;

                console.log(
                  '[ORDERS] Resolved internal orderId:',
                  resolvedOrderId,
                  'from Razorpay order:',
                  normalizedRazorpayOrderId
                );
              } catch (lookupError: any) {
                console.warn(
                  '[ORDERS] Could not resolve internal orderId:',
                  lookupError?.message ||
                  lookupError
                );
              }
            }

            const normalizedData = {
              ...rawData,
              orderId: resolvedOrderId,
              orderNumber:
                rawData.orderNumber ??
                rawData.order?.orderNumber ??
                null,
              razorpayOrderId:
                normalizedRazorpayOrderId,
              key_id:
                rawData.key_id ??
                rawData.keyId ??
                paymentData.key_id ??
                paymentData.keyId ??
                paymentData.key ??
                null,
              amount:
                rawData.amount ??
                paymentData.amount ??
                null,
              currency:
                rawData.currency ??
                paymentData.currency ??
                'INR',
            };

            set({
              isLoading: false,
            });

            return {
              success: true,
              data: normalizedData,
            };
          } else {
            console.warn(
              '[ORDERS] createOrder rejected:',
              JSON.stringify(
                response.data,
                null,
                2
              )
            );

            set({
              isLoading: false,
              error: response.data.message,
            });

            return {
              success: false,
              error:
                response.data.message,
            };
          }
        } catch (error: any) {
          const serverErr =
            error?.response?.data;

          console.warn(
            '[ORDERS] createOrder error:',
            JSON.stringify(
              serverErr,
              null,
              2
            )
          );

          const errorMsg =
            serverErr?.errors?.[0]?.message ||
            serverErr?.message ||
            error?.message ||
            'Failed to connect to server';

          set({
            isLoading: false,
            error: errorMsg,
          });

          return {
            success: false,
            error: errorMsg,
          };
        }
      },

      verifyPayment: async ({ orderId, paymentId, signature }) => {
        set({ isLoading: true, error: null });

        try {
          if (!orderId || !paymentId || !signature) {
            const error = 'Payment verification data is incomplete.';
            set({ isLoading: false, error });
            return { success: false, error };
          }

          console.log('[ORDERS] ===== VERIFY RAZORPAY PAYMENT =====');
          console.log('[ORDERS] orderId:', orderId);
          console.log('[ORDERS] paymentId:', paymentId);
          console.log('[ORDERS] signature present:', Boolean(signature));

          const response = await api.post('/orders/verify-payment', {
            orderId,
            paymentId,
            signature,
          });

          console.log(
            '[ORDERS] verify-payment response:',
            JSON.stringify(response.data, null, 2)
          );

          if (!response.data?.success) {
            const error =
              response.data?.message ||
              response.data?.data?.message ||
              'Payment verification failed.';

            set({ isLoading: false, error });
            return { success: false, error };
          }

          set({ isLoading: false, error: null });

          // Only refresh after verification succeeds. This prevents the
          // pre-payment pending order from being inserted into the UI.
          await get().fetchOrders();

          return {
            success: true,
            data: response.data.data,
          };
        } catch (error: any) {
          const serverErr = error?.response?.data;
          const errorMsg =
            serverErr?.errors?.[0]?.message ||
            serverErr?.message ||
            error?.message ||
            'Payment verification failed.';

          console.warn(
            '[ORDERS] verify-payment error:',
            JSON.stringify(serverErr, null, 2)
          );

          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        }
      },

      cancelOrder: async (orderId) => {
        try {
          if (!orderId) {
            return {
              success: false,
              error: 'Order ID is missing.',
            };
          }

          console.log('[ORDERS] Cancelling order on server:', orderId);

          // Customer API exposes POST /orders/:orderId/cancel. There is no
          // documented DELETE /orders/:orderId endpoint, so the UI must not
          // pretend that deleting a card/order locally is enough.
          const response = await api.post(
            `/orders/${encodeURIComponent(orderId)}/cancel`
          );

          console.log(
            '[ORDERS] cancel response:',
            JSON.stringify(response.data, null, 2)
          );

          if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
            const error =
              response.data?.message ||
              response.data?.errors?.[0]?.message ||
              'Unable to cancel the order.';

            return {
              success: false,
              error,
            };
          }

          // Re-read from the server so the UI cannot keep a stale order
          // after cancellation. The server remains the source of truth.
          await get().fetchOrders();

          return {
            success: true,
            data: response.data.data,
          };
        } catch (error: any) {
          const serverErr = error?.response?.data;
          const errorMsg =
            serverErr?.errors?.[0]?.message ||
            serverErr?.message ||
            error?.message ||
            'Unable to cancel the order.';

          console.warn(
            '[ORDERS] cancelOrder error:',
            JSON.stringify(serverErr, null, 2)
          );

          return {
            success: false,
            error: errorMsg,
          };
        }
      },
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(
        () => AsyncStorage
      ),
    }
  )
);