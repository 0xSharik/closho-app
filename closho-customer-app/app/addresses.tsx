import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing } from '../src/theme/spacing';
import * as Haptics from 'expo-haptics';
import { Button } from '../src/components/ui/Button';
import { useProfileStore } from '../src/store/profileStore';

export default function AddressesScreen() {
  const router = useRouter();
  const { addresses, isLoading, fetchAddresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useProfileStore();
  const [isModalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newType, setNewType] = useState('home');
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: ''
  });

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

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
      pincode: addr.pincode
    });
    setModalVisible(true);
  };

  const handleSaveAddress = async () => {
    if (!formData.fullName || !formData.phone || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode) {
      Alert.alert('Error', 'Please fill all mandatory fields');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);
    
    let res;
    if (editingId) {
      res = await updateAddress(editingId, {
        ...formData,
        type: newType
      });
    } else {
      res = await addAddress({
        ...formData,
        type: newType,
        isDefault: addresses.length === 0
      });
    }
    
    setIsSubmitting(false);
    
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      setEditingId(null);
      setFormData({ fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '' });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', res.message || 'Failed to save address');
    }
  };

  const handleDelete = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Delete Address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeAddress(id) }
    ]);
  };

  const handleSetDefault = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setDefaultAddress(id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Addresses</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading && addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={64} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>No addresses saved.</Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.addressCard}>
              <View style={styles.cardHeader}>
                <View style={styles.typeWrapper}>
                  <Ionicons 
                    name={addr.type === 'home' ? 'home-outline' : 'briefcase-outline'} 
                    size={20} 
                    color={colors.primary} 
                  />
                  <Text style={styles.typeText}>{addr.type.toUpperCase()}</Text>
                </View>
                {addr.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>Default</Text>
                  </View>
                )}
              </View>
              <Text style={styles.nameText}>{addr.fullName}</Text>
              <Text style={styles.addressText}>
                {addr.addressLine1}
                {addr.addressLine2 ? `, ${addr.addressLine2}` : ''}
                {`\n${addr.city}, ${addr.state} - ${addr.pincode}`}
                {`\nPhone: ${addr.phone}`}
              </Text>
              <View style={styles.actions}>
                {!addr.isDefault && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleSetDefault(addr.id)}>
                    <Text style={styles.actionText}>Make Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(addr)}>
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(addr.id)}>
                  <Text style={[styles.actionText, { color: colors.status.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button 
          title="Add New Address" 
          onPress={() => { 
            Haptics.impactAsync(); 
            setEditingId(null);
            setFormData({ fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '' });
            setNewType('home');
            setModalVisible(true); 
          }} 
        />
      </View>

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Address' : 'Add New Address'}</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setEditingId(null);
                setFormData({ fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '' });
              }} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Address Type</Text>
              <View style={styles.typeSelector}>
                {['home', 'office', 'other'].map(type => (
                  <TouchableOpacity 
                    key={type} 
                    style={[styles.typeBtn, newType === type && styles.typeBtnActive]}
                    onPress={() => setNewType(type)}
                  >
                    <Text style={[styles.typeBtnText, newType === type && styles.typeBtnTextActive]}>{type.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput style={styles.textInput} value={formData.fullName} onChangeText={t => setFormData({...formData, fullName: t})} />
              
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.textInput} keyboardType="phone-pad" placeholder="10-digit mobile number" placeholderTextColor={colors.text.tertiary} maxLength={10} value={formData.phone} onChangeText={t => setFormData({...formData, phone: t.replace(/[^0-9]/g, '').slice(0, 10)})} />
              
              <Text style={styles.inputLabel}>Address Line 1</Text>
              <TextInput style={styles.textInput} value={formData.addressLine1} onChangeText={t => setFormData({...formData, addressLine1: t})} />
              
              <Text style={styles.inputLabel}>Address Line 2 (Optional)</Text>
              <TextInput style={styles.textInput} value={formData.addressLine2} onChangeText={t => setFormData({...formData, addressLine2: t})} />
              
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={{flex: 1}}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput style={styles.textInput} value={formData.city} onChangeText={t => setFormData({...formData, city: t})} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput style={styles.textInput} value={formData.state} onChangeText={t => setFormData({...formData, state: t})} />
                </View>
              </View>
              
              <Text style={styles.inputLabel}>Pincode</Text>
              <TextInput style={styles.textInput} keyboardType="number-pad" value={formData.pincode} onChangeText={t => setFormData({...formData, pincode: t})} />
              
              <Button 
                title={isSubmitting ? "Saving..." : "Save Address"} 
                disabled={isSubmitting}
                onPress={handleSaveAddress} 
                style={{ marginTop: spacing.xl, marginBottom: spacing.xl }} 
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  backBtn: { padding: spacing.xs },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.text.primary },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyText: { fontSize: typography.fontSize.md, color: colors.text.tertiary, marginTop: spacing.md },
  addressCard: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 16, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  typeWrapper: { flexDirection: 'row', alignItems: 'center' },
  typeText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.text.primary, marginLeft: spacing.xs },
  defaultBadge: { backgroundColor: colors.primary + '20', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 12 },
  defaultText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary },
  nameText: { fontSize: typography.fontSize.md, fontWeight: 'bold', color: colors.text.primary, marginBottom: 4 },
  addressText: { fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: 20, marginBottom: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.md },
  actionBtn: { marginRight: spacing.xl },
  actionText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.primary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.borderLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.text.primary },
  closeBtn: { padding: spacing.xs },
  modalBody: { paddingVertical: spacing.lg },
  typeSelector: { flexDirection: 'row', marginBottom: spacing.lg },
  typeBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, marginHorizontal: 4 },
  typeBtnActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  typeBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.text.secondary },
  typeBtnTextActive: { color: colors.primary },
  inputLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.text.primary, marginBottom: spacing.xs, marginTop: spacing.md },
  textInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: spacing.md, fontSize: typography.fontSize.md, color: colors.text.primary },
});
