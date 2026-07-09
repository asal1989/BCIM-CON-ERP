import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { poAPI, quotationAPI, vendorAPI, workOrderAPI, mrsAPI, inventoryAPI, subcontractorAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';

function money(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

const PO_STATUS_COLOR = {
  draft:          '#94A3B8',
  pending:        '#F59E0B',
  verified_audit: '#0EA5E9',
  released_mgmt:  '#8B5CF6',
  approved:       '#10B981',
  part_received:  '#06B6D4',
  received:       '#3B82F6',
  cancelled:      '#EF4444',
};
const WO_STATUS_COLOR = {
  draft: '#94A3B8', pending: '#F59E0B', approved: '#10B981',
  active: '#0D9488', completed: '#3B82F6', terminated: '#EF4444',
};

function KpiCard({ icon, label, value, sub, color }) {
  const bg = `${color}18`;
  return (
    <Card style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </Card>
  );
}

function SectionHeader({ icon, title, subtitle, onViewAll }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLeft}>
        <MaterialCommunityIcons name={icon} size={16} color={theme.colors.primary} />
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.viewAll}>View all →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusBadge({ status, colorMap }) {
  const color = colorMap[status] || '#94A3B8';
  return (
    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.badgeText, { color }]}>{(status || 'draft').replace(/_/g, ' ')}</Text>
    </View>
  );
}

export default function ProcurementDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();
  const projectId = selectedProject?.id;
  const thisMonth = dayjs().format('YYYY-MM');

  const { data: pos = [], isLoading: loadP } = useQuery({
    queryKey: ['proc-dash-pos', projectId],
    queryFn: () => poAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId,
  });
  const { data: quotations = [], isLoading: loadQ } = useQuery({
    queryKey: ['proc-dash-quotations', projectId],
    queryFn: () => quotationAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId,
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-dash-vendors'],
    queryFn: () => vendorAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: wos = [] } = useQuery({
    queryKey: ['proc-dash-wos', projectId],
    queryFn: () => subcontractorAPI.listWorkOrders(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
  });
  const { data: mrsList = [] } = useQuery({
    queryKey: ['proc-dash-mrs', projectId],
    queryFn: () => mrsAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId,
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ['proc-dash-low-stock', projectId],
    queryFn: () => inventoryAPI.lowStock(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId,
  });

  const thisMonthPOs  = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonth);
  const poValueMonth  = thisMonthPOs.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const poValueTotal  = pos.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const pendingPOs    = pos.filter(p => p.status === 'pending');
  const receivedValue = pos.filter(p => ['received','fully_received','part_received'].includes(p.status))
                           .reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const pendingQuotes = quotations.filter(q => q.status === 'sent' || q.status === 'draft');
  const activeWOs     = wos.filter(w => ['submitted','approved','active'].includes(w.status));
  const woValueTotal  = wos.reduce((s, w) => s + parseFloat(w.total_value || 0), 0);
  const pendingMRS    = mrsList.filter(m => m.status === 'pending' || m.status === 'draft');

  const poStatusBuckets = useMemo(() => {
    const b = {};
    for (const p of pos) {
      const s = p.status || 'draft';
      if (!b[s]) b[s] = { count: 0, amount: 0 };
      b[s].count++;
      b[s].amount += parseFloat(p.grand_total || p.total_amount || 0);
    }
    return b;
  }, [pos]);

  const recentPOs = [...pos].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  const recentWOs = [...wos].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <Screen>
      <ScreenHeader title="Procurement Dashboard" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={styles.container}>

        {/* KPI Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll}>
          <KpiCard icon="cart-outline"        label="POs This Month"  value={thisMonthPOs.length}      color="#3B82F6" sub={money(poValueMonth)} />
          <KpiCard icon="currency-inr"        label="Total PO Spend"  value={money(poValueTotal)}       color="#10B981" sub={`${pos.length} orders`} />
          <KpiCard icon="hammer"              label="Total WO Spend"  value={money(woValueTotal)}       color="#8B5CF6" sub={`${wos.length} work orders`} />
          <KpiCard icon="trending-up"         label="Quotes Pending"  value={pendingQuotes.length}      color="#F59E0B" sub="Awaiting evaluation" />
          <KpiCard icon="clipboard-list"      label="MRS Pending"     value={pendingMRS.length}         color="#D97706" sub="Awaiting approval" />
          <KpiCard icon="account-group"       label="Vendors"         value={vendors.length}            color="#64748B" sub="Registered" />
        </ScrollView>

        {/* Alert banners */}
        {pendingPOs.length > 0 && (
          <TouchableOpacity style={styles.alertAmber} onPress={() => navigation.navigate('PurchaseOrders')}>
            <MaterialCommunityIcons name="clock-outline" size={15} color="#92400E" />
            <Text style={styles.alertAmberText}>{pendingPOs.length} PO{pendingPOs.length > 1 ? 's' : ''} pending audit</Text>
            <Text style={styles.alertLink}>Review →</Text>
          </TouchableOpacity>
        )}
        {lowStock.length > 0 && (
          <TouchableOpacity style={styles.alertRed} onPress={() => navigation.navigate('Stores')}>
            <MaterialCommunityIcons name="alert-outline" size={15} color="#991B1B" />
            <Text style={styles.alertRedText}>{lowStock.length} item{lowStock.length > 1 ? 's' : ''} below reorder level</Text>
            <Text style={styles.alertLinkRed}>View →</Text>
          </TouchableOpacity>
        )}

        {/* Progress: PO Fulfilment + WO */}
        <View style={styles.row}>
          <Card style={{ flex: 1 }}>
            <Text style={styles.progressLabel}>PO Fulfilment</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${poValueTotal > 0 ? Math.min(100, (receivedValue / poValueTotal) * 100) : 0}%`, backgroundColor: '#10B981' }]} />
            </View>
            <Text style={styles.progressSub}>Received: {money(receivedValue)}</Text>
            <Text style={styles.progressSub}>Total: {money(poValueTotal)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.progressLabel}>WO Progress</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${wos.length > 0 ? Math.min(100, (activeWOs.length / wos.length) * 100) : 0}%`, backgroundColor: '#3B82F6' }]} />
            </View>
            <Text style={styles.progressSub}>Active: {activeWOs.length}</Text>
            <Text style={styles.progressSub}>Total: {wos.length}</Text>
          </Card>
        </View>

        {/* PO Status Breakdown */}
        <Card>
          <SectionHeader icon="cart-outline" title="PO Status Breakdown" subtitle={`${pos.length} total POs`} />
          {Object.keys(poStatusBuckets).length === 0 ? (
            <Text style={styles.empty}>No purchase orders yet</Text>
          ) : (
            Object.entries(poStatusBuckets).map(([status, d]) => {
              const color = PO_STATUS_COLOR[status] || '#94A3B8';
              const pct = pos.length > 0 ? (d.count / pos.length) * 100 : 0;
              return (
                <View key={status} style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: color }]} />
                  <Text style={styles.statusLabel}>{status.replace(/_/g, ' ')}</Text>
                  <View style={styles.statusBarTrack}>
                    <View style={[styles.statusBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.statusCount}>{d.count}</Text>
                  <Text style={styles.statusAmount}>{money(d.amount)}</Text>
                </View>
              );
            })
          )}
        </Card>

        {/* Recent Purchase Orders */}
        <Card>
          <SectionHeader icon="cart-outline" title="Recent Purchase Orders" subtitle="Latest activity"
            onViewAll={() => navigation.navigate('PurchaseOrders')} />
          {loadP ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} /> :
            recentPOs.length === 0 ? <Text style={styles.empty}>No purchase orders found</Text> :
            recentPOs.map((p, i) => (
              <View key={p.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{p.po_number || `PO-${p.id}`}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{p.vendor_name || '—'}</Text>
                  <Text style={styles.listDate}>{p.po_date ? dayjs(p.po_date).format('DD MMM YY') : '—'}</Text>
                </View>
                <View style={styles.listRight}>
                  <Text style={styles.listAmount}>{money(p.grand_total || p.total_amount)}</Text>
                  <StatusBadge status={p.status} colorMap={PO_STATUS_COLOR} />
                </View>
              </View>
            ))
          }
        </Card>

        {/* Work Orders */}
        <Card>
          <SectionHeader icon="hammer" title="Recent Work Orders" subtitle={`${wos.length} total`}
            onViewAll={() => navigation.navigate('WorkOrders')} />
          {recentWOs.length === 0 ? <Text style={styles.empty}>No work orders found</Text> :
            recentWOs.map((w, i) => (
              <View key={w.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{w.wo_number || `WO-${w.id}`}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{w.vendor_name || w.contractor_name || '—'}</Text>
                </View>
                <View style={styles.listRight}>
                  <Text style={styles.listAmount}>{money(w.total_value)}</Text>
                  <StatusBadge status={w.status} colorMap={WO_STATUS_COLOR} />
                </View>
              </View>
            ))
          }
        </Card>

        {/* Pending Quotations */}
        <Card>
          <SectionHeader icon="trending-up" title="Quotations Pending" subtitle={`${pendingQuotes.length} awaiting evaluation`} />
          {loadQ ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} /> :
            pendingQuotes.length === 0 ? <Text style={styles.empty}>No pending quotations</Text> :
            pendingQuotes.slice(0, 6).map((q, i) => (
              <View key={q.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{q.quotation_number || `Q-${q.id}`}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{q.vendor_name || q.subject || '—'}</Text>
                  <Text style={styles.listDate}>{q.created_at ? dayjs(q.created_at).format('DD MMM YY') : '—'}</Text>
                </View>
              </View>
            ))
          }
        </Card>

        {/* Pending MRS */}
        <Card>
          <SectionHeader icon="clipboard-list" title="Material Requests Pending" subtitle={`${pendingMRS.length} awaiting approval`}
            onViewAll={() => navigation.navigate('MaterialRequest')} />
          {pendingMRS.length === 0 ? <Text style={styles.empty}>No pending material requests</Text> :
            pendingMRS.slice(0, 6).map((m, i) => (
              <View key={m.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{m.mrs_number || m.serial_no_formatted || `MRS-${m.id}`}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{m.project_name || '—'}</Text>
                  <Text style={styles.listDate}>{m.created_at ? dayjs(m.created_at).format('DD MMM YY') : '—'}</Text>
                </View>
                <StatusBadge status={m.status} colorMap={{ pending: '#F59E0B', draft: '#94A3B8' }} />
              </View>
            ))
          }
        </Card>

        {/* Low Stock */}
        {lowStock.length > 0 && (
          <Card>
            <SectionHeader icon="alert-outline" title={`Low Stock — ${lowStock.length} item${lowStock.length > 1 ? 's' : ''}`} subtitle="Below reorder level" />
            {lowStock.slice(0, 8).map((item, i) => (
              <View key={i} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{item.material_name || item.item_name || '—'}</Text>
                  <Text style={styles.listSub}>{item.category || '—'}</Text>
                </View>
                <View style={styles.listRight}>
                  <Text style={[styles.listAmount, { color: theme.colors.danger }]}>
                    {parseFloat(item.closing_stock ?? item.current_stock ?? 0).toFixed(2)}
                  </Text>
                  <Text style={styles.listDate}>min {parseFloat(item.min_stock ?? item.reorder_level ?? 0).toFixed(2)} {item.unit || ''}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Vendors */}
        <Card>
          <SectionHeader icon="account-group" title="Vendors" subtitle={`${vendors.length} registered`}
            onViewAll={() => navigation.navigate('Vendors')} />
          <View style={styles.vendorGrid}>
            {vendors.slice(0, 12).map(v => (
              <View key={v.id} style={styles.vendorChip}>
                <Text style={styles.vendorName} numberOfLines={1}>{v.name}</Text>
                <Text style={styles.vendorType}>{v.vendor_type || 'Vendor'}</Text>
              </View>
            ))}
            {vendors.length > 12 && (
              <View style={[styles.vendorChip, { borderStyle: 'dashed' }]}>
                <Text style={styles.vendorType}>+{vendors.length - 12} more</Text>
              </View>
            )}
          </View>
        </Card>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.md, gap: 12, paddingBottom: 30 },
  kpiScroll: { marginHorizontal: -theme.spacing.md, paddingHorizontal: theme.spacing.md, marginBottom: 4 },
  kpiCard: { width: 130, marginRight: 10 },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  kpiLabel: { fontSize: 10, color: theme.colors.muted, fontWeight: '600', marginTop: 2 },
  kpiSub: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  alertAmber: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  alertAmberText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' },
  alertLink: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  alertRed: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  alertRedText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#991B1B' },
  alertLinkRed: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  row: { flexDirection: 'row', gap: 10 },
  progressLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  progressTrack: { height: 8, backgroundColor: theme.colors.surface, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  progressSub: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  sectionSub: { fontSize: 10, color: theme.colors.muted, marginTop: 1 },
  viewAll: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, color: theme.colors.textSecondary, width: 90, textTransform: 'capitalize' },
  statusBarTrack: { flex: 1, height: 4, backgroundColor: theme.colors.surface, borderRadius: 2, overflow: 'hidden' },
  statusBarFill: { height: 4, borderRadius: 2 },
  statusCount: { fontSize: 11, fontWeight: '700', color: theme.colors.text, width: 20, textAlign: 'right' },
  statusAmount: { fontSize: 10, color: theme.colors.muted, width: 52, textAlign: 'right' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  listRef: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  listSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  listDate: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  listRight: { alignItems: 'flex-end', gap: 4 },
  listAmount: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
  empty: { fontSize: 12, color: theme.colors.muted, textAlign: 'center', paddingVertical: 16 },
  vendorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vendorChip: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 140 },
  vendorName: { fontSize: 11, fontWeight: '600', color: theme.colors.text },
  vendorType: { fontSize: 9, color: theme.colors.muted, marginTop: 1 },
});
