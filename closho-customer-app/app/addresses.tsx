import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Button } from '../src/components/ui/Button';
import { useProfileStore } from '../src/store/profileStore';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { friendlyError } from '../src/utils/friendlyError';
import {
  logUserEvent,
  logValidationFailure,
} from '../src/utils/userEventLogger';

// Small breathing-room gap kept between the top of the modal's
// scrollable area and whichever field currently has focus.
const INPUT_TOP_OFFSET = spacing.lg;

export default function AddressesScreen() {
  const router = useRouter();

  const {
    addresses,
    isLoading,
    fetchAddresses,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
  } = useProfileStore();

  const [isModalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [newType, setNewType] = useState('home');

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
  });

  // ─────────────────────────────────────────────────────────────
  // Input refs
  // ─────────────────────────────────────────────────────────────

  const scrollViewRef = useRef<ScrollView>(null);

  const fullNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const addrLine1Ref = useRef<TextInput>(null);
  const addrLine2Ref = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const stateRef = useRef<TextInput>(null);
  const pincodeRef = useRef<TextInput>(null);

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  // ─────────────────────────────────────────────────────────────
  // Keyboard visibility tracking
  //
  // Drives extra bottom padding in the form's ScrollView so
  // there's always enough scroll room to bring the last field
  // (and the Save button beneath it) fully above the keyboard.
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const showEvent: 'keyboardWillShow' | 'keyboardDidShow' =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent: 'keyboardWillHide' | 'keyboardDidHide' =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Keyboard-aware scrolling
  //
  // Measures the focused input relative to the ScrollView using
  // UIManager.measureLayout with plain node handles (via
  // findNodeHandle), then scrolls it just clear of the top edge.
  //
  // Calling `.measureLayout()` directly on a component ref (the
  // old approach here) is what throws "ref.measureLayout must be
  // called with a ref to a native component" on current React
  // Native/Hermes builds - the ScrollView ref is a composite
  // component, not the raw native node that legacy API expects.
  // UIManager.measureLayout works with numeric handles instead,
  // so it sidesteps that check entirely.
  // ─────────────────────────────────────────────────────────────

  const scrollToInput = (
    inputRef: React.RefObject<TextInput | null>
  ) => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      const scrollView = scrollViewRef.current;

      if (!input || !scrollView) return;

      const inputHandle = findNodeHandle(input);
      const scrollHandle = findNodeHandle(scrollView);

      if (!inputHandle || !scrollHandle) return;

      UIManager.measureLayout(
        inputHandle,
        scrollHandle,
        () => {
          // Measurement can legitimately fail mid-transition
          // (e.g. rapid focus changes) - just skip this scroll.
        },
        (_x, y) => {
          scrollView.scrollTo({
            y: Math.max(0, y - INPUT_TOP_OFFSET),
            animated: true,
          });
        }
      );
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    router.back();
  };

  // ─────────────────────────────────────────────────────────────
  // Form helpers
  // ─────────────────────────────────────────────────────────────

  const resetModal = () => {
    setEditingId(null);

    setFormData({
      fullName: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      pincode: '',
    });

    setNewType('home');
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setModalVisible(false);
    resetModal();
  };

  // ─────────────────────────────────────────────────────────────
  // Edit address
  // ─────────────────────────────────────────────────────────────

  const handleEdit = (addr: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setEditingId(addr.id);
    setNewType(addr.type);

    setFormData({
      fullName: addr.fullName,
      phone: addr.phone.replace('+91', ''),
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
    });

    setModalVisible(true);
  };

  // ─────────────────────────────────────────────────────────────
  // Save address
  // ─────────────────────────────────────────────────────────────

  const handleSaveAddress = async () => {
    Keyboard.dismiss();

    const missingFields = Object.entries({
      fullName: formData.fullName,
      phone: formData.phone,
      addressLine1: formData.addressLine1,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
    })
      .filter(([, value]) => !value.trim())
      .map(([field]) => field);

    if (missingFields.length > 0) {
      logValidationFailure('address.save', missingFields);

      const labels: Record<string, string> = {
        fullName: 'full name',
        phone: 'phone number',
        addressLine1: 'address line 1',
        city: 'city',
        state: 'state',
        pincode: 'PIN code',
      };

      Alert.alert(
        'Complete your address',
        `Please enter: ${missingFields
          .map((field) => labels[field])
          .join(', ')}.`
      );

      return;
    }

    if (!/^\d{10}$/.test(formData.phone.replace(/\s+/g, ''))) {
      logValidationFailure('address.save', ['phone']);

      Alert.alert(
        'Check your phone number',
        'Enter a valid 10-digit mobile number.'
      );

      return;
    }

    if (!/^\d{6}$/.test(formData.pincode.replace(/\s+/g, ''))) {
      logValidationFailure('address.save', ['pincode']);

      Alert.alert(
        'Check your PIN code',
        'Enter a valid 6-digit PIN code.'
      );

      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setIsSubmitting(true);

    let res;

    if (editingId) {
      res = await updateAddress(editingId, {
        ...formData,
        type: newType,
      });
    } else {
      res = await addAddress({
        ...formData,
        type: newType,
        isDefault: addresses.length === 0,
      });
    }

    setIsSubmitting(false);

    if (res.success) {
      logUserEvent(
        editingId
          ? 'address.update_completed'
          : 'address.create_completed'
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      setModalVisible(false);
      resetModal();
    } else {
      logUserEvent(
        editingId
          ? 'address.update_failed'
          : 'address.create_failed',
        {
          reason: 'store_rejected',
        }
      );

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error
      );

      Alert.alert(
        'Could not save address',
        friendlyError(
          res.message,
          'Please check your address details and try again.'
        )
      );
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Delete address
  // ─────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await removeAddress(id);

            logUserEvent(
              result.success
                ? 'address.remove_completed'
                : 'address.remove_failed',
              {
                addressId: id,
              }
            );
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Set default
  // ─────────────────────────────────────────────────────────────

  const handleSetDefault = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await setDefaultAddress(id);

    logUserEvent(
      result.success
        ? 'address.set_default_completed'
        : 'address.set_default_failed',
      {
        addressId: id,
      }
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ───────────────────────────────────────────────────────
          Main Header
      ─────────────────────────────────────────────────────── */}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.text.primary}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>My Addresses</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* ───────────────────────────────────────────────────────
          Saved Addresses
      ─────────────────────────────────────────────────────── */}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
            />
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="location-outline"
              size={64}
              color={colors.text.tertiary}
            />

            <Text style={styles.emptyText}>
              No addresses saved.
            </Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <View
              key={addr.id}
              style={styles.addressCard}
            >
              <View style={styles.cardHeader}>
                <View style={styles.typeWrapper}>
                  <Ionicons
                    name={
                      addr.type === 'home'
                        ? 'home-outline'
                        : 'briefcase-outline'
                    }
                    size={20}
                    color={colors.primary}
                  />

                  <Text style={styles.typeText}>
                    {addr.type.toUpperCase()}
                  </Text>
                </View>

                {addr.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>
                      Default
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.nameText}>
                {addr.fullName}
              </Text>

              <Text style={styles.addressText}>
                {addr.addressLine1}
                {addr.addressLine2
                  ? `, ${addr.addressLine2}`
                  : ''}
                {`\n${addr.city}, ${addr.state} - ${addr.pincode}`}
                {`\nPhone: ${addr.phone}`}
              </Text>

              <View style={styles.actions}>
                {!addr.isDefault && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() =>
                      handleSetDefault(addr.id)
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionText}>
                      Make Default
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleEdit(addr)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionText}>
                    Edit
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDelete(addr.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.actionText,
                      {
                        color: colors.status.error,
                      },
                    ]}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ───────────────────────────────────────────────────────
          Add Address Footer
      ─────────────────────────────────────────────────────── */}

      <View style={styles.footer}>
        <Button
          title="Add New Address"
          onPress={() => {
            Haptics.impactAsync();
            resetModal();
            setModalVisible(true);
          }}
        />
      </View>

      {/* ───────────────────────────────────────────────────────
          Address Form Modal
      ─────────────────────────────────────────────────────── */}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.keyboardContainer}
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : 'height'
            }
          >
            <View style={styles.modalContent}>
              {/* Modal Header */}

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId
                    ? 'Edit Address'
                    : 'Add New Address'}
                </Text>

                <TouchableOpacity
                  onPress={closeModal}
                  style={styles.closeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.text.primary}
                  />
                </TouchableOpacity>
              </View>

              {/* 
                The Pressable catches taps on empty space and
                dismisses the keyboard.

                keyboardShouldPersistTaps="handled" means tapping
                another TextInput does NOT dismiss the keyboard.

                keyboardDismissMode="none" means scrolling does
                NOT dismiss the keyboard.
              */}

              <Pressable
                style={styles.modalBodyWrapper}
                onPress={Keyboard.dismiss}
              >
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.modalBody}
                  contentContainerStyle={[
                    styles.modalBodyContent,
                    { paddingBottom: 40 + keyboardHeight },
                  ]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="none"
                  automaticallyAdjustKeyboardInsets={
                    Platform.OS === 'ios'
                  }
                >
                  {/* ─────────────────────────────────────────
                      Address Type
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Address Type
                  </Text>

                  <View style={styles.typeSelector}>
                    {['home', 'office', 'other'].map(
                      (type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.typeBtn,
                            newType === type &&
                            styles.typeBtnActive,
                          ]}
                          onPress={() =>
                            setNewType(type)
                          }
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.typeBtnText,
                              newType === type &&
                              styles.typeBtnTextActive,
                            ]}
                          >
                            {type.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>

                  {/* ─────────────────────────────────────────
                      Full Name
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Full Name
                  </Text>

                  <TextInput
                    ref={fullNameRef}
                    style={styles.textInput}
                    value={formData.fullName}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        fullName: text,
                      })
                    }
                    returnKeyType="next"
                    onSubmitEditing={() =>
                      phoneRef.current?.focus()
                    }
                    onFocus={() =>
                      scrollToInput(fullNameRef)
                    }
                    blurOnSubmit={false}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholder="Enter full name"
                    placeholderTextColor={
                      colors.text.tertiary
                    }
                  />

                  {/* ─────────────────────────────────────────
                      Phone
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Phone
                  </Text>

                  <TextInput
                    ref={phoneRef}
                    style={styles.textInput}
                    keyboardType="phone-pad"
                    placeholder="10-digit mobile number"
                    placeholderTextColor={
                      colors.text.tertiary
                    }
                    maxLength={10}
                    value={formData.phone}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        phone: text
                          .replace(/[^0-9]/g, '')
                          .slice(0, 10),
                      })
                    }
                    returnKeyType="next"
                    onSubmitEditing={() =>
                      addrLine1Ref.current?.focus()
                    }
                    onFocus={() =>
                      scrollToInput(phoneRef)
                    }
                  />

                  {/* ─────────────────────────────────────────
                      Address Line 1
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Address Line 1
                  </Text>

                  <TextInput
                    ref={addrLine1Ref}
                    style={styles.textInput}
                    value={formData.addressLine1}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        addressLine1: text,
                      })
                    }
                    returnKeyType="next"
                    onSubmitEditing={() =>
                      addrLine2Ref.current?.focus()
                    }
                    onFocus={() =>
                      scrollToInput(addrLine1Ref)
                    }
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    placeholder="House / Flat / Street"
                    placeholderTextColor={
                      colors.text.tertiary
                    }
                  />

                  {/* ─────────────────────────────────────────
                      Address Line 2
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Address Line 2 (Optional)
                  </Text>

                  <TextInput
                    ref={addrLine2Ref}
                    style={styles.textInput}
                    value={formData.addressLine2}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        addressLine2: text,
                      })
                    }
                    returnKeyType="next"
                    onSubmitEditing={() =>
                      cityRef.current?.focus()
                    }
                    onFocus={() =>
                      scrollToInput(addrLine2Ref)
                    }
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    placeholder="Apartment / Landmark"
                    placeholderTextColor={
                      colors.text.tertiary
                    }
                  />

                  {/* ─────────────────────────────────────────
                      City + State
                  ───────────────────────────────────────── */}

                  <View style={styles.cityStateRow}>
                    <View style={styles.cityStateField}>
                      <Text style={styles.inputLabel}>
                        City
                      </Text>

                      <TextInput
                        ref={cityRef}
                        style={styles.textInput}
                        value={formData.city}
                        onChangeText={(text) =>
                          setFormData({
                            ...formData,
                            city: text,
                          })
                        }
                        returnKeyType="next"
                        onSubmitEditing={() =>
                          stateRef.current?.focus()
                        }
                        onFocus={() =>
                          scrollToInput(cityRef)
                        }
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="City"
                        placeholderTextColor={
                          colors.text.tertiary
                        }
                      />
                    </View>

                    <View style={styles.cityStateField}>
                      <Text style={styles.inputLabel}>
                        State
                      </Text>

                      <TextInput
                        ref={stateRef}
                        style={styles.textInput}
                        value={formData.state}
                        onChangeText={(text) =>
                          setFormData({
                            ...formData,
                            state: text,
                          })
                        }
                        returnKeyType="next"
                        onSubmitEditing={() =>
                          pincodeRef.current?.focus()
                        }
                        onFocus={() =>
                          scrollToInput(stateRef)
                        }
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="State"
                        placeholderTextColor={
                          colors.text.tertiary
                        }
                      />
                    </View>
                  </View>

                  {/* ─────────────────────────────────────────
                      Pincode
                  ───────────────────────────────────────── */}

                  <Text style={styles.inputLabel}>
                    Pincode
                  </Text>

                  <TextInput
                    ref={pincodeRef}
                    style={styles.textInput}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={formData.pincode}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        pincode: text
                          .replace(/[^0-9]/g, '')
                          .slice(0, 6),
                      })
                    }
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    onFocus={() =>
                      scrollToInput(pincodeRef)
                    }
                    placeholder="6-digit PIN code"
                    placeholderTextColor={
                      colors.text.tertiary
                    }
                  />

                  {/* ─────────────────────────────────────────
                      Save
                  ───────────────────────────────────────── */}

                  <View style={styles.saveButtonContainer}>
                    <Button
                      title={
                        isSubmitting
                          ? 'Saving...'
                          : 'Save Address'
                      }
                      disabled={isSubmitting}
                      onPress={handleSaveAddress}
                    />
                  </View>

                  {/* Extra bottom space so the button/input
                      never sits against the edge. */}
                  <View style={styles.bottomSpacer} />
                </ScrollView>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ───────────────────────────────────────────────────────────
  // Main screen
  // ───────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },

  backBtn: {
    padding: spacing.xs,
  },

  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },

  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },

  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.text.tertiary,
    marginTop: spacing.md,
  },

  // ───────────────────────────────────────────────────────────
  // Address cards
  // ───────────────────────────────────────────────────────────

  addressCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  typeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  typeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
    marginLeft: spacing.xs,
  },

  defaultBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },

  defaultText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },

  nameText: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },

  addressText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },

  actionBtn: {
    marginRight: spacing.xl,
  },

  actionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },

  // ───────────────────────────────────────────────────────────
  // Modal
  // ───────────────────────────────────────────────────────────

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },

  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    height: '92%',
    overflow: 'hidden',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },

  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },

  closeBtn: {
    padding: spacing.xs,
  },

  modalBodyWrapper: {
    flex: 1,
  },

  modalBody: {
    flex: 1,
  },

  modalBodyContent: {
    paddingTop: spacing.lg,
    paddingBottom: 40,
  },

  // ───────────────────────────────────────────────────────────
  // Address type
  // ───────────────────────────────────────────────────────────

  typeSelector: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },

  typeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginHorizontal: 4,
  },

  typeBtnActive: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary,
  },

  typeBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  typeBtnTextActive: {
    color: colors.primary,
  },

  // ───────────────────────────────────────────────────────────
  // Inputs
  // ───────────────────────────────────────────────────────────

  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },

  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    minHeight: 48,
  },

  // ───────────────────────────────────────────────────────────
  // City / State
  // ───────────────────────────────────────────────────────────

  cityStateRow: {
    flexDirection: 'row',
    gap: 10,
  },

  cityStateField: {
    flex: 1,
  },

  // ───────────────────────────────────────────────────────────
  // Save
  // ───────────────────────────────────────────────────────────

  saveButtonContainer: {
    marginTop: spacing.xl,
  },

  bottomSpacer: {
    height: 24,
  },
});