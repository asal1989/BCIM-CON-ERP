import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { poAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Stage-based role guards mirroring po.routes.js
const PROCUREMENT_ROLES = ['procurement', 'procurement_manager', 'procurement_engineer'];
function canProcurementApprove(user) {
  const r = (user?.role || '').toLowerCase();
  const e = (user?.email || '').toLowerCase();
  return r === 'super_admin' || PROCUREMENT_ROLES.some(p => r.includes(p)) ||
    ['stephen@bcim.in', 'it@bcim.in'].includes(e);
}
function canMdApprove(user) {
  const r = (user?.role || '').toLowerCase();
  const e = (user?.email || '').toLowerCase();
  return r === 'super_admin' || ['md', 'ceo', 'managing_director'].includes(r) ||
    ['stephen@bcim.in', 'it@bcim.in'].includes(e);
}

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

function SectionHeader({ title, expanded, onToggle }) {
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <MaterialCommunityIcons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18} color={theme.colors.muted}
      />
    </TouchableOpacity>
  );
}

export default function PODetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showItems, setShowItems]   = useState(true);
  const [showBills, setShowBills]   = useState(false);
  const [showVendor, setShowVendor] = useState(false);

  const { data: po, isLoading, isError, refetch } = useQuery({
    queryKey: ['po-detail', id],
    queryFn: () => poAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const { data: billsData } = useQuery({
    queryKey: ['po-bills', id],
    queryFn: () => poAPI.bills(id).then(r => r.data),
    enabled: showBills,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['po-detail', id] });
    qc.invalidateQueries({ queryKey: ['po-list'] });
  };

  const approveMutation = useMutation({
    mutationFn: (stage) => poAPI.approve(id, stage),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason) => poAPI.reject(id, reason),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Rejection failed'),
  });

  const confirmApprove = (stage, label) => Alert.alert(`${label}`, `Confirm approval of this PO?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Approve', onPress: () => approveMutation.mutate(stage) },
  ]);

  const confirmReject = () => Alert.alert('Reject PO', 'Reject this purchase order?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate('Rejected via mobile app') },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Purchase Order" showBack />
        <ErrorState message="Couldn't load PO" onRetry={refetch} />
      </Screen>
    );
  }

  const status    = po?.status;
  const isPending = status === 'pending';
  const isVerified = status === 'verified_audit' || status === 'released_mgmt';
  const canReject = (isPending || isVerified) && (canProcurementApprove(user) || canMdApprove(user));
  const items     = po?.items || [];
  const bills     = billsData?.bills || [];
  const billSummary = billsData?.summary;
  const grandTotal = parseFloat(po?.grand_total || po?.total_amount || 0);

  return (
    <Screen>
      <ScreenHeader
        title={po?.po_number || po?.serial_no_formatted || 'Purchase Order'}
        subtitle={po?.project_name}
        showBack
        right={po && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : po ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          {/* Amount Summary */}
          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>PO Value</Text>
                <Text style={styles.amountVal}>{money(grandTotal)}</Text>
              </View>
              {parseFloat(po.freight_charges) > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Freight</Text>
                  <Text style={styles.amountVal}>{money(po.freight_charges)}</Text>
                </View>
              )}
              {parseFloat(po.tcs_amount) > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>TCS</Text>
                  <Text style={styles.amountVal}>{money(po.tcs_amount)}</Text>
                </View>
              )}
            </View>
          </Card>

          {/* Core Details */}
          <Card>
            <MetaRow label="PO Date" value={po.po_date ? dayjs(po.po_date).format('DD MMM YYYY') : null} />
            <MetaRow label="Vendor" value={po.vendor_name} />
            {po.payment_terms ? <MetaRow label="Payment Terms" value={po.payment_terms} /> : null}
            {po.delivery_address ? <MetaRow label="Delivery To" value={po.delivery_address} /> : null}
            {po.department ? <MetaRow label="Department" value={po.department} /> : null}
            <MetaRow label="Created By" value={po.created_by_name} last={!po.remarks} />
            {po.remarks ? <MetaRow label="Remarks" value={po.remarks} last /> : null}
          </Card>

          {/* Approval Trail */}
          {(po.verified_audit_name || po.checked_finance_name || po.released_mgmt_name || po.authorized_md_name) && (
            <Card>
              <Text style={styles.trailTitle}>Approval Trail</Text>
              {po.verified_audit_name   ? <MetaRow label="Procurement"  value={po.verified_audit_name} /> : null}
              {po.checked_finance_name  ? <MetaRow label="Finance"      value={po.checked_finance_name} /> : null}
              {po.released_mgmt_name    ? <MetaRow label="Management"   value={po.released_mgmt_name} /> : null}
              {po.authorized_md_name    ? <MetaRow label="MD/CEO"       value={po.authorized_md_name} last /> : null}
            </Card>
          )}

          {/* Vendor Info (collapsible) */}
          <Card>
            <SectionHeader title={`Vendor — ${po.vendor_name}`} expanded={showVendor} onToggle={() => setShowVendor(v => !v)} />
            {showVendor && (
              <View style={{ marginTop: 8 }}>
                {po.vendor_gstin         ? <MetaRow label="GSTIN"   value={po.vendor_gstin} /> : null}
                {po.vendor_contact_person ? <MetaRow label="Contact" value={po.vendor_contact_person} /> : null}
                {po.vendor_phone         ? <MetaRow label="Phone"   value={po.vendor_phone} /> : null}
                {po.vendor_email         ? <MetaRow label="Email"   value={po.vendor_email} last /> : null}
              </View>
            )}
          </Card>

          {/* Items (collapsible) */}
          <Card>
            <SectionHeader title={`Items (${items.length})`} expanded={showItems} onToggle={() => setShowItems(v => !v)} />
            {showItems && items.map((it, i) => (
              <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.material_name || it.description}</Text>
                  {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                  {it.boq_chapter ? <Text style={styles.itemMeta}>{it.boq_chapter}</Text> : null}
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>{parseFloat(it.quantity || 0)} {it.unit || ''}</Text>
                  <Text style={styles.itemRate}>@ {money(it.rate)}</Text>
                  <Text style={styles.itemTotal}>{money(it.total_amount)}</Text>
                </View>
              </View>
            ))}
          </Card>

          {/* Linked Bills (collapsible) */}
          <Card>
            <SectionHeader
              title={billSummary ? `Bills (${billSummary.count}) — Billed: ${money(billSummary.total_billed)}` : 'Linked Bills'}
              expanded={showBills}
              onToggle={() => setShowBills(v => !v)}
            />
            {showBills && billSummary && (
              <View style={{ marginTop: 8 }}>
                <View style={styles.billSummaryRow}>
                  <View style={styles.billSummaryItem}>
                    <Text style={styles.billSummaryLabel}>Billed</Text>
                    <Text style={styles.billSummaryVal}>{money(billSummary.total_billed)}</Text>
                  </View>
                  <View style={styles.billSummaryItem}>
                    <Text style={styles.billSummaryLabel}>Paid</Text>
                    <Text style={[styles.billSummaryVal, { color: theme.colors.success }]}>{money(billSummary.total_paid)}</Text>
                  </View>
                  <View style={styles.billSummaryItem}>
                    <Text style={styles.billSummaryLabel}>Outstanding</Text>
                    <Text style={[styles.billSummaryVal, { color: '#E11D48' }]}>{money(billSummary.total_outstanding)}</Text>
                  </View>
                </View>
                {bills.map((b, i) => (
                  <View key={b.id ?? i} style={[styles.billRow, i < bills.length - 1 && styles.itemBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billInv}>{b.inv_number || `Bill #${b.sl_number}`}</Text>
                      <Text style={styles.billDate}>{b.inv_date ? dayjs(b.inv_date).format('DD MMM YYYY') : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.billTotal}>{money(b.total_amount)}</Text>
                      <StatusBadge status={b.workflow_status} />
                    </View>
                  </View>
                ))}
                {bills.length === 0 && <Text style={styles.noBills}>No bills linked yet</Text>}
              </View>
            )}
          </Card>

          {/* Action Buttons */}
          {isPending && canProcurementApprove(user) && (
            <Button
              title="Procurement Approve"
              onPress={() => confirmApprove('procurement-approve', 'Procurement Approve')}
              loading={approveMutation.isPending}
            />
          )}
          {isVerified && canMdApprove(user) && (
            <Button
              title="MD / Final Approve"
              onPress={() => confirmApprove('md-approve', 'MD Approve')}
              loading={approveMutation.isPending}
            />
          )}
          {canReject && (
            <Button
              title="Reject PO"
              variant="outline"
              onPress={confirmReject}
              loading={rejectMutation.isPending}
              style={{ marginTop: isPending || isVerified ? 0 : 8 }}
            />
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountCard: {},
  amountRow: { flexDirection: 'row', justifyContent: 'space-around' },
  amountGroup: { alignItems: 'center' },
  amountLabel: { fontSize: 11, color: theme.colors.muted, textTransform: 'uppercase' },
  amountVal: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  trailTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.textSecondary },
  itemRate: { fontSize: 11, color: theme.colors.muted },
  itemTotal: { fontSize: 13, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'], marginTop: 2 },
  billSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: 8 },
  billSummaryItem: { alignItems: 'center' },
  billSummaryLabel: { fontSize: 10, color: theme.colors.muted, textTransform: 'uppercase' },
  billSummaryVal: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 3, fontVariant: ['tabular-nums'] },
  billRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  billInv: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  billDate: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  billTotal: { fontSize: 13, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'], marginBottom: 4 },
  noBills: { fontSize: 12, color: theme.colors.muted, textAlign: 'center', paddingVertical: 12 },
});
