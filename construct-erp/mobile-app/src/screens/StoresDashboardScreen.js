import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { ignAPI, mrsAPI, minAPI, inventoryAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';

const MRS_LABEL = {
  pending: 'Pending', stores_verified: 'Stores ✓', verified_tower: 'Tower ✓',
  approved_pm: 'PM Apvd', approved_srpm: 'Sr PM Apvd', approved_mgmt: 'Mgmt Apvd',
  approved_md: 'MD Apvd', issued: 'Issued', rejected: 'Rejected',
};
const MRS_COLOR = {
  pending: '#F59E0B', stores_verified: '#0EA5E9', verified_tower: '#0EA5E9',
  approved_pm: '#6366F1', approved_srpm: '#6366F1', approved_mgmt: '#8B5CF6',
  approved_md: '#10B981', issued: '#0D9488', rejected: '#EF4444',
};

const MRS_STAGES = [
  { key: 'pending',        label: 'Pending',  color: '#F59E0B' },
  { key: 'stores_verified',label: 'Stores',   color: '#0EA5E9' },
  { key: 'approved_pm',    label: 'PM',       color: '#6366F1' },
  { key: 'approved_mgmt',  label: 'Mgmt',     color: '#8B5CF6' },
  { key: 'approved_md',    label: 'MD',       color: '#10B981' },
  { key: 'issued',         label: 'Issued',   color: '#0D9488' },
];

const MRS_CLOSED = ['issued', 'rejected', 'draft'];
const MRS_IN_APPROVAL = ['stores_verified','verified_tower','approved_pm','approved_srpm','approved_mgmt','approved_md'];

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <Card style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: `${color}18` }]}>
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

export default function StoresDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();
  const projectId = selectedProject?.id;
  const now = dayjs();

  const { data: grns = [], isLoading: loadG } = useQuery({
    queryKey: ['stores-dash-igns', projectId],
    queryFn: () => ignAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId, staleTime: 60000,
  });
  const { data: mrs = [], isLoading: loadM } = useQuery({
    queryKey: ['stores-dash-mrs', projectId],
    queryFn: () => mrsAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId, staleTime: 60000,
  });
  const { data: issues = [], isLoading: loadI } = useQuery({
    queryKey: ['stores-dash-issues', projectId],
    queryFn: () => minAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId, staleTime: 60000,
  });
  const { data: inventory = [], isLoading: loadInv } = useQuery({
    queryKey: ['stores-dash-inventory', projectId],
    queryFn: () => inventoryAPI.list(projectId).then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!projectId, staleTime: 60000,
  });

  const pendingGRNs   = grns.filter(g => g.status === 'pending');
  const inspectedGRNs = grns.filter(g => g.status === 'inspected');
  const awaitingGRNs  = [...pendingGRNs, ...inspectedGRNs];
  const openMRS       = mrs.filter(m => !MRS_CLOSED.includes(m.status));
  const pendingMRS    = mrs.filter(m => m.status === 'pending');
  const inApproval    = mrs.filter(m => MRS_IN_APPROVAL.includes(m.status));
  const issuedMRS     = mrs.filter(m => m.status === 'issued');
  const recentMRS     = [...mrs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  const thisMonthIssues = issues.filter(i => dayjs(i.issue_date || i.created_at).isSame(now, 'month'));
  const recentIssues  = [...issues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const lowStock      = inventory.filter(i => {
    const c = parseFloat(i.closing_stock ?? i.current_stock ?? 0);
    const m = parseFloat(i.min_stock ?? i.reorder_level ?? 0);
    return m > 0 && c <= m;
  });
  const outOfStock    = inventory.filter(i => parseFloat(i.closing_stock ?? i.current_stock ?? 0) <= 0);

  // Category breakdown
  const catCount = {};
  inventory.forEach(i => { const c = i.category || 'Other'; catCount[c] = (catCount[c] || 0) + 1; });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const CAT_COLORS = ['#6366F1','#0EA5E9','#10B981','#F59E0B','#8B5CF6'];

  return (
    <Screen>
      <ScreenHeader title="Stores Dashboard" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={styles.container}>

        {/* KPI Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll}>
          <KpiCard icon="clipboard-list-outline" label="Open MRS"          value={openMRS.length}          color="#4F46E5" sub={`${mrs.length} total`} />
          <KpiCard icon="clock-outline"          label="In Approval"       value={inApproval.length}       color="#D97706" sub="Awaiting sign-off" />
          <KpiCard icon="package-check"          label="Issued"            value={issuedMRS.length}        color="#10B981" sub="MRS fulfilled" />
          <KpiCard icon="truck-outline"          label="IGN Pending"       value={awaitingGRNs.length}     color="#3B82F6" sub={`${grns.length} total IGNs`} />
          <KpiCard icon="arrow-up-right"         label="Issues This Month" value={thisMonthIssues.length}  color="#0D9488" sub={`${issues.length} total`} />
          <KpiCard icon="alert-outline"          label="Low Stock"         value={lowStock.length}         color="#DC2626" sub={`${outOfStock.length} out of stock`} />
        </ScrollView>

        {/* Alert banners */}
        {lowStock.length > 0 && (
          <TouchableOpacity style={styles.alertAmber} onPress={() => navigation.navigate('StoreLedger')}>
            <MaterialCommunityIcons name="alert-outline" size={15} color="#92400E" />
            <Text style={styles.alertAmberText}>{lowStock.length} item{lowStock.length > 1 ? 's' : ''} at or below reorder level</Text>
            <Text style={styles.alertLink}>Ledger →</Text>
          </TouchableOpacity>
        )}
        {awaitingGRNs.length > 0 && (
          <TouchableOpacity style={styles.alertBlue} onPress={() => navigation.navigate('IGN')}>
            <MaterialCommunityIcons name="clock-outline" size={15} color="#1E40AF" />
            <Text style={styles.alertBlueText}>{awaitingGRNs.length} IGN{awaitingGRNs.length > 1 ? 's' : ''} pending approval</Text>
            <Text style={styles.alertLinkBlue}>Review →</Text>
          </TouchableOpacity>
        )}

        {/* MRS Pipeline */}
        <Card>
          <SectionHeader icon="clipboard-list-outline" title="MRS Pipeline" subtitle={`${mrs.length} total requisitions`}
            onViewAll={() => navigation.navigate('MaterialRequest')} />

          {/* Stage workflow bar */}
          <View style={styles.stageBar}>
            {MRS_STAGES.map((s, idx) => {
              const count = mrs.filter(m => m.status === s.key ||
                (s.key === 'approved_pm' && ['approved_pm','approved_srpm'].includes(m.status))).length;
              const active = count > 0;
              return (
                <React.Fragment key={s.key}>
                  <View style={styles.stageItem}>
                    <View style={[styles.stageDot, { backgroundColor: active ? s.color : theme.colors.surface, borderColor: active ? s.color : theme.colors.border }]}>
                      <Text style={[styles.stageDotText, { color: active ? '#fff' : theme.colors.muted }]}>
                        {active ? count : idx + 1}
                      </Text>
                    </View>
                    <Text style={[styles.stageLabel, active && { color: theme.colors.text, fontWeight: '700' }]}>{s.label}</Text>
                  </View>
                  {idx < MRS_STAGES.length - 1 && <View style={styles.stageLine} />}
                </React.Fragment>
              );
            })}
          </View>

          {/* Stage summary chips */}
          <View style={styles.stageSummary}>
            <View style={[styles.summaryChip, { backgroundColor: '#FFFBEB' }]}>
              <Text style={[styles.summaryChipVal, { color: '#B45309' }]}>{pendingMRS.length}</Text>
              <Text style={styles.summaryChipLabel}>Pending</Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: '#EEF2FF' }]}>
              <Text style={[styles.summaryChipVal, { color: '#4338CA' }]}>{inApproval.length}</Text>
              <Text style={styles.summaryChipLabel}>In Approval</Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: '#F0FDFA' }]}>
              <Text style={[styles.summaryChipVal, { color: '#0F766E' }]}>{issuedMRS.length}</Text>
              <Text style={styles.summaryChipLabel}>Issued</Text>
            </View>
          </View>
        </Card>

        {/* Recent MRS */}
        <Card>
          <SectionHeader icon="file-document-outline" title="Recent Material Requisitions" subtitle="Latest activity"
            onViewAll={() => navigation.navigate('MaterialRequest')} />
          {loadM ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} /> :
            recentMRS.length === 0 ? <Text style={styles.empty}>No requisitions yet</Text> :
            recentMRS.map((m, i) => {
              const color = MRS_COLOR[m.status] || '#94A3B8';
              return (
                <View key={m.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRef}>{m.serial_no_formatted || m.mrs_number || `MRS-${m.id}`}</Text>
                    <Text style={styles.listSub} numberOfLines={1}>{m.project_name || '—'}</Text>
                    <Text style={styles.listDate}>{dayjs(m.created_at).fromNow ? dayjs(m.created_at).format('DD MMM YY') : '—'}</Text>
                  </View>
                  <View style={styles.listRight}>
                    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                      <Text style={[styles.badgeText, { color }]}>{MRS_LABEL[m.status] || m.status}</Text>
                    </View>
                    <Text style={styles.listDate}>{m.items?.length || 0} items</Text>
                  </View>
                </View>
              );
            })
          }
        </Card>

        {/* IGN Status + Material Issues side by side */}
        <View style={styles.row}>
          {/* IGN Status */}
          <Card style={{ flex: 1 }}>
            <SectionHeader icon="truck-outline" title="IGN Status" subtitle={`${grns.length} total`}
              onViewAll={() => navigation.navigate('IGN')} />
            <View style={styles.statPair}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{grns.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FFFBEB' }]}>
                <Text style={[styles.statVal, { color: '#B45309' }]}>{awaitingGRNs.length}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>
            {[
              { label: 'Pending',   value: pendingGRNs.length,   color: '#F59E0B' },
              { label: 'Inspected', value: inspectedGRNs.length, color: '#0EA5E9' },
              { label: 'Approved',  value: grns.filter(g => g.status === 'approved').length, color: '#10B981' },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.miniRow}>
                <View style={[styles.miniDot, { backgroundColor: color }]} />
                <Text style={styles.miniLabel}>{label}</Text>
                <Text style={styles.miniVal}>{value}</Text>
              </View>
            ))}
          </Card>

          {/* Material Issues */}
          <Card style={{ flex: 1 }}>
            <SectionHeader icon="arrow-up-right" title="Issues" subtitle={`${issues.length} total`} />
            <View style={styles.statPair}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{issues.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#F0FDF4' }]}>
                <Text style={[styles.statVal, { color: '#166534' }]}>{thisMonthIssues.length}</Text>
                <Text style={styles.statLabel}>This Month</Text>
              </View>
            </View>
            {loadI ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> :
              recentIssues.length === 0 ? <Text style={styles.empty}>No issues yet</Text> :
              recentIssues.map((i, idx) => (
                <View key={i.id} style={[styles.miniRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRef} numberOfLines={1}>{i.min_number || `MIN-${i.id}`}</Text>
                    <Text style={styles.listDate} numberOfLines={1}>{i.project_name || i.issued_to || '—'}</Text>
                  </View>
                  <Text style={styles.listDate}>{dayjs(i.issue_date || i.created_at).format('DD MMM')}</Text>
                </View>
              ))
            }
          </Card>
        </View>

        {/* Inventory Health */}
        <Card>
          <SectionHeader icon="warehouse" title="Inventory" subtitle={`${inventory.length} materials`}
            onViewAll={() => navigation.navigate('StoreLedger')} />
          <View style={styles.inventoryStats}>
            <View style={styles.inventoryStat}>
              <Text style={styles.inventoryStatVal}>{inventory.length}</Text>
              <Text style={styles.inventoryStatLabel}>Total Items</Text>
            </View>
            <View style={[styles.inventoryStat, lowStock.length > 0 && { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.inventoryStatVal, lowStock.length > 0 && { color: '#DC2626' }]}>{lowStock.length}</Text>
              <Text style={styles.inventoryStatLabel}>Low Stock</Text>
            </View>
            <View style={[styles.inventoryStat, outOfStock.length > 0 && { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.inventoryStatVal, outOfStock.length > 0 && { color: '#DC2626' }]}>{outOfStock.length}</Text>
              <Text style={styles.inventoryStatLabel}>Out of Stock</Text>
            </View>
          </View>
          {loadInv ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} /> :
            topCats.map(([cat, count], i) => {
              const pct = inventory.length > 0 ? Math.round((count / inventory.length) * 100) : 0;
              return (
                <View key={cat} style={styles.catRow}>
                  <View style={[styles.miniDot, { backgroundColor: CAT_COLORS[i] }]} />
                  <Text style={styles.catLabel} numberOfLines={1}>{cat}</Text>
                  <View style={styles.catBarTrack}>
                    <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: CAT_COLORS[i] }]} />
                  </View>
                  <Text style={styles.catCount}>{count}</Text>
                </View>
              );
            })
          }
        </Card>

        {/* Low Stock table */}
        {lowStock.length > 0 && (
          <Card>
            <SectionHeader icon="alert-outline" title={`Low Stock Alert — ${lowStock.length} item${lowStock.length > 1 ? 's' : ''}`}
              subtitle="At or below minimum level" />
            {lowStock.slice(0, 10).map((item, i) => (
              <View key={i} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRef}>{item.material_name || '—'}</Text>
                  <Text style={styles.listSub}>{item.category || '—'}</Text>
                </View>
                <View style={styles.listRight}>
                  <Text style={[styles.listAmount, { color: '#DC2626' }]}>
                    {parseFloat(item.closing_stock ?? item.current_stock ?? 0).toFixed(2)}
                  </Text>
                  <Text style={styles.listDate}>min {parseFloat(item.min_stock ?? item.reorder_level ?? 0).toFixed(2)} {item.unit || ''}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Quick Links */}
        <View style={styles.quickGrid}>
          {[
            { screen: 'MaterialRequest', icon: 'clipboard-list-outline', label: 'Material Requisitions', sub: `${openMRS.length} open`,        color: '#4F46E5' },
            { screen: 'IGN',             icon: 'truck-outline',           label: 'Inward Goods Notes',    sub: `${grns.length} total`,           color: '#0891B2' },
            { screen: 'StoreLedger',     icon: 'warehouse',               label: 'Store Ledger',           sub: `${inventory.length} materials`,  color: '#7C3AED' },
          ].map(({ screen, icon, label, sub, color }) => (
            <TouchableOpacity key={screen} style={styles.quickCard} onPress={() => navigation.navigate(screen)}>
              <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}>
                <MaterialCommunityIcons name={icon} size={20} color={color} />
              </View>
              <Text style={styles.quickLabel}>{label}</Text>
              <Text style={styles.quickSub}>{sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
  alertBlue: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  alertBlueText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#1E40AF' },
  alertLinkBlue: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  sectionSub: { fontSize: 10, color: theme.colors.muted, marginTop: 1 },
  viewAll: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  stageBar: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stageItem: { flex: 1, alignItems: 'center', gap: 4 },
  stageDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stageDotText: { fontSize: 11, fontWeight: '700' },
  stageLabel: { fontSize: 8, color: theme.colors.muted, textAlign: 'center', fontWeight: '600' },
  stageLine: { height: 2, flex: 0.5, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 18 },
  stageSummary: { flexDirection: 'row', gap: 8 },
  summaryChip: { flex: 1, borderRadius: theme.radius.sm, padding: 10, alignItems: 'center' },
  summaryChipVal: { fontSize: 20, fontWeight: '800' },
  summaryChipLabel: { fontSize: 9, color: theme.colors.muted, fontWeight: '600', marginTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  listRef: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  listSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  listDate: { fontSize: 10, color: theme.colors.muted, marginTop: 1 },
  listRight: { alignItems: 'flex-end', gap: 4 },
  listAmount: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  empty: { fontSize: 12, color: theme.colors.muted, textAlign: 'center', paddingVertical: 16 },
  statPair: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statBox: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 9, color: theme.colors.muted, fontWeight: '600', marginTop: 2 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniLabel: { flex: 1, fontSize: 11, color: theme.colors.textSecondary },
  miniVal: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  inventoryStats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  inventoryStat: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm, padding: 10, alignItems: 'center' },
  inventoryStatVal: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  inventoryStatLabel: { fontSize: 9, color: theme.colors.muted, fontWeight: '600', marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  catLabel: { fontSize: 11, color: theme.colors.textSecondary, flex: 1 },
  catBarTrack: { width: 70, height: 4, backgroundColor: theme.colors.surface, borderRadius: 2, overflow: 'hidden' },
  catBarFill: { height: 4, borderRadius: 2 },
  catCount: { fontSize: 11, fontWeight: '700', color: theme.colors.text, width: 20, textAlign: 'right' },
  quickGrid: { flexDirection: 'row', gap: 8 },
  quickCard: { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, alignItems: 'center', gap: 6 },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  quickSub: { fontSize: 9, color: theme.colors.muted, textAlign: 'center' },
});
