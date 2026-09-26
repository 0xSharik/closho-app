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
  trackingNumber?: string;
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
  }) => Promise<{ success: boolean; data?: any; error?: string }>;
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

            console.log(
              '[ORDERS] Total raw orders:',
              rawOrders.length
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
              rawOrders.map(async (o: any) => {
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
            await get().fetchOrders();

            set({
              isLoading: false,
            });

            return {
              success: true,
              data: response.data.data,
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
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(
        () => AsyncStorage
      ),
    }
  )
);