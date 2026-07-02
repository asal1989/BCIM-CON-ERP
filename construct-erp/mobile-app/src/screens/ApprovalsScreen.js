import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Modal, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { approvalsAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

// Mirrors ApprovalsPage.jsx's TYPE_META so icons/colors match the web app.
const TYPE_META = {
  'SC Bill':           { icon: 'receipt',                    color: '#4F46E5' },
  'Work Order':        { icon: 'briefcase-outline',          color: '#059669' },
  'Measurement Book':  { icon: 'layers-outline',              color: '#0D9488' },
  'NMR Muster Roll':   { icon: 'file-document-outline',      color: '#1D4ED8' },
  'Retention Release': { icon: 'shield-check-outline',       color: '#D97706' },
  'NCR':               { icon: 'alert-outline',              color: '#DC2626' },
  'Submittal':         { icon: 'file-document-outline',      color: '#7C3AED' },
  'Purchase Order':    { icon: 'cart-outline',                color: '#EA580C' },
  'MRS':               { icon: 'package-variant-closed',      color: '#0891B2' },
  'Petty Cash':        { icon: 'bank-outline',                color: '#D97706' },
};
const DEFAULT_META = { icon: 'file-outline', color: theme.colors.primary };

const MRS_STATUS_LABEL = {
  pending: 'Awaiting Store Manager', stores_verified: 'Awaiting Project Manager',
  verified_tower: 'Awaiting Project Manager', approved_pm: 'Awaiting Project Director',
  approved_srpm: 'Awaiting Project Director', approved_mgmt: 'Awaiting MD Approval',
  approved_md: 'Fully Approved', rejected: 'Rejected',
};
const PO_STATUS_LABEL = { pending: 'Awaiting Procurement Approval', verified_audit: 'Awaiting MD Authorization', released_mgmt: 'Awaiting MD Authorization' };
const WO_STATUS_LABEL = { draft: 'Awaiting Procurement Approval', pending: 'Awaiting Procurement Approval', submitted: 'Awaiting MD Authorization', active: 'Awaiting MD Authorization' };

function statusLabel(item) {
  if (item.doc_type === 'MRS') return MRS_STATUS_LABEL[item.status] || item.status;
  if (item.doc_type === 'Purchase Order') return PO_STATUS_LABEL[item.status] || item.status;
  if (item.entity_type === 'work_order') return WO_STATUS_LABEL[item.status] || item.status;
  return (item.status || '').replace(/_/g, ' ');
}
function daysOld(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}
function daysAgoLabel(createdAt) {
  const d = daysOld(createdAt);
  return d <= 0 ? 'Today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

export default function ApprovalsScreen() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { item, action }
  const [comments, setComments] = useState('');

  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ['approvals-pending'],
    queryFn: () => approvalsAPI.pending().then(r => r.data ?? {}),
  });

  const allItems = raw?.data || [];
  const summary = raw?.summary || {};
  const total = raw?.total || 0;

  const tabs = useMemo(() => ['All', ...new Set(allItems.map(i => i.doc_type).filter(Boolean))], [allItems]);

  const filtered = useMemo(() => {
    let list = filter === 'All' ? allItems : allItems.filter(i => i.doc_type === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => [i.ref_no, i.party_name, i.project_name, i.doc_type, i.extra_info].some(v => v?.toLowerCase().includes(q)));
    }
    return list;
  }, [allItems, filter, search]);

  const urgent = filtered.filter(i => daysOld(i.created_at) >= 3);
  const normal = filtered.filter(i => daysOld(i.created_at) < 3);
  const sections = [
    ...(urgent.length ? [{ title: `Urgent — 3+ Days (${urgent.length})`, data: urgent, urgent: true }] : []),
    ...(normal.length ? [{ title: urgent.length ? `Recent (${normal.length})` : null, data: normal, urgent: false }] : []),
  ];
  const flatData = sections.flatMap(s => [{ __header: s.title, __urgent: s.urgent }, ...s.data]);

  const decide = useMutation({
    mutationFn: ({ entity_type, entity_id, action, comments }) => approvalsAPI.decide(entity_type, entity_id, action, comments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-pending'] });
      setModal(null);
      setComments('');
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not process approval'),
  });

  const openModal = (item, action) => { setComments(''); setModal({ item, action }); };
  const submitDecision = () => {
    if (modal.action === 'reject' && !comments.trim()) return Alert.alert('Rejection reason required');
    decide.mutate({ entity_type: modal.item.entity_type, entity_id: modal.item.id, action: modal.action, comments });
  };

  return (
    <Screen>
      <ScreenHeader title="My Approvals" subtitle={`${total} item${total !== 1 ? 's' : ''} waiting for your action`} />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load approvals" onRetry={refetch} />
      ) : total === 0 ? (
        <EmptyState icon="check-circle-outline" title="All caught up" subtitle="No pending approvals right now." />
      ) : (
        <>
          {/* KPI summary */}
          <View style={styles.kpiRow}>
            <Card style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{total}</Text>
              <Text style={styles.kpiLabel}>Total Pending</Text>
            </Card>
            <Card style={[styles.kpiCard, urgent.length > 0 && styles.kpiCardUrgent]}>
              <Text style={[styles.kpiValue, urgent.length > 0 && styles.kpiValueUrgent]}>{urgent.length}</Text>
              <Text style={styles.kpiLabel}>Urgent (3+ days)</Text>
            </Card>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search ref, party, project…" placeholderTextColor={theme.colors.muted} style={styles.searchInput} />
          </View>

          {/* Type filter tabs */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={tabs}
            keyExtractor={(t) => t}
            contentContainerStyle={styles.tabsRow}
            renderItem={({ item: tab }) => (
              <TouchableOpacity onPress={() => setFilter(tab)} style={[styles.tab, filter === tab && styles.tabActive]}>
                <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>
                  {tab} ({tab === 'All' ? total : (summary[tab] || 0)})
                </Text>
              </TouchableOpacity>
            )}
          />

          <FlatList
            data={flatData}
            keyExtractor={(item, i) => item.__header !== undefined ? `header-${i}` : `${item.entity_type}-${item.id}-${i}`}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}
            renderItem={({ item }) => {
              if (item.__header !== undefined) {
                return item.__header ? (
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: item.__urgent ? theme.colors.danger : theme.colors.primary }]} />
                    <Text style={[styles.sectionTitle, item.__urgent && styles.sectionTitleUrgent]}>{item.__header}</Text>
                  </View>
                ) : null;
              }
              const meta = TYPE_META[item.doc_type] || DEFAULT_META;
              const urgentItem = daysOld(item.created_at) >= 3;
              return (
                <Card style={[styles.itemCard, { borderLeftColor: urgentItem ? theme.colors.danger : meta.color }]}>
                  <View style={styles.rowTop}>
                    <View style={[styles.typeIconWrap, { backgroundColor: `${meta.color}1A` }]}>
                      <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: `${meta.color}1A` }]}>
                          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{item.doc_type}</Text>
                        </View>
                        {urgentItem && (
                          <View style={styles.urgentBadge}>
                            <MaterialCommunityIcons name="alert" size={10} color={theme.colors.danger} />
                            <Text style={styles.urgentBadgeText}>{daysOld(item.created_at)}d</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.statusLabel}>{statusLabel(item)}</Text>
                    </View>
                    {!!item.amount && <Text style={styles.amount}>₹{Number(item.amount).toLocaleString('en-IN')}</Text>}
                  </View>

                  <Text style={styles.title}>{item.ref_no || item.party_name || `#${item.id}`}</Text>
                  {item.party_name && item.ref_no ? <Text style={styles.sub}>{item.party_name}</Text> : null}
                  {item.extra_info ? <Text style={styles.sub}>{item.extra_info}</Text> : null}

                  <View style={styles.metaRow}>
                    {item.project_name ? <Text style={styles.meta}>{item.project_name}</Text> : null}
                    {item.submitted_by ? <Text style={styles.meta}>by {item.submitted_by}</Text> : null}
                    <Text style={styles.meta}>{daysAgoLabel(item.created_at)}</Text>
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openModal(item, 'reject')}>
                      <MaterialCommunityIcons name="close" size={16} color={theme.colors.danger} />
                      <Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => openModal(item, 'approve')}>
                      <MaterialCommunityIcons name="check" size={16} color="#fff" />
                      <Text style={styles.approveText}>{item.entity_type === 'work_order' ? 'Authorise' : 'Approve'}</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            }}
            ListEmptyComponent={<EmptyState icon="magnify-close" title="No items match your filter" />}
          />
        </>
      )}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {modal?.action === 'approve' ? 'Approve' : 'Reject'} {modal?.item.doc_type || 'item'}
            </Text>
            <Text style={styles.modalSub}>{modal?.item.ref_no || modal?.item.party_name}</Text>
            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder={modal?.action === 'approve' ? 'Add any remarks (optional)…' : 'State the reason for rejection…'}
              placeholderTextColor={theme.colors.muted}
              multiline
              numberOfLines={3}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setModal(null)} style={{ flex: 1 }} />
              <Button
                title={modal?.action === 'approve' ? 'Approve' : 'Reject'}
                onPress={submitDecision}
                loading={decide.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 10, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md },
  kpiCard: { flex: 1 },
  kpiCardUrgent: { borderColor: theme.colors.danger },
  kpiValue: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  kpiValueUrgent: { color: theme.colors.danger },
  kpiLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.card,
    marginHorizontal: theme.spacing.md, marginTop: theme.spacing.md, paddingHorizontal: 12, height: 42,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  tabsRow: { paddingHorizontal: theme.spacing.md, gap: 8, paddingVertical: 10 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  tabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2 },
  sectionDot: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  sectionTitleUrgent: { color: theme.colors.danger },
  itemCard: { borderLeftWidth: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typeIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  urgentBadgeText: { fontSize: 10, fontWeight: '800', color: theme.colors.danger },
  statusLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 3, textTransform: 'capitalize' },
  amount: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
  title: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 10 },
  sub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  meta: { fontSize: 11, color: theme.colors.muted, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: theme.radius.sm },
  rejectBtn: { borderWidth: 1.5, borderColor: theme.colors.danger },
  rejectText: { color: theme.colors.danger, fontWeight: '700', fontSize: 13 },
  approveBtn: { backgroundColor: theme.colors.success },
  approveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, textTransform: 'capitalize' },
  modalSub: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  modalInput: {
    marginTop: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    padding: 12, fontSize: 13, color: theme.colors.text, height: 80, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
