import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { itTicketAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const PRIORITY_COLORS = { critical: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A' };
const RESOLVE_ROLES = ['super_admin', 'admin', 'it_admin', 'it_support'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function ITTicketDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = React.useState('');

  const { data: ticket, isLoading, isError, refetch } = useQuery({
    queryKey: ['it-ticket-detail', id],
    queryFn: () => itTicketAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['it-ticket-detail', id] });
    qc.invalidateQueries({ queryKey: ['it-tickets-list'] });
  };

  const resolveMut = useMutation({
    mutationFn: () => itTicketAPI.resolve(id, notes.trim() || 'Resolved via mobile app'),
    onSuccess: () => { invalidate(); setNotes(''); },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not resolve ticket'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="IT Ticket" showBack />
        <ErrorState message="Couldn't load ticket" onRetry={refetch} />
      </Screen>
    );
  }

  const status = ticket?.status || '';
  const role   = user?.role || '';
  const priority = (ticket?.priority || '').toLowerCase();
  const priColor = PRIORITY_COLORS[priority] || theme.colors.muted;
  const canResolve = RESOLVE_ROLES.includes(role) || role === 'super_admin';

  return (
    <Screen>
      <ScreenHeader
        title={ticket?.ticket_number || `Ticket #${id}`}
        subtitle={ticket?.project_name}
        showBack
        right={ticket && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : ticket ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          {ticket.priority && (
            <View style={[styles.priorityBar, { backgroundColor: priColor }]}>
              <Text style={styles.priorityText}>{ticket.priority.toUpperCase()} PRIORITY</Text>
            </View>
          )}

          <Card>
            {ticket.subject     ? <MetaRow label="Subject"     value={ticket.subject} /> : null}
            {ticket.category    ? <MetaRow label="Category"    value={ticket.category} /> : null}
            {ticket.description ? <MetaRow label="Description" value={ticket.description} /> : null}
            {ticket.asset_name  ? <MetaRow label="Asset"       value={ticket.asset_name} /> : null}
            {ticket.created_at  ? <MetaRow label="Raised"      value={dayjs(ticket.created_at).format('DD MMM YYYY, HH:mm')} /> : null}
            {ticket.raised_by_name ? <MetaRow label="Raised By" value={ticket.raised_by_name} /> : null}
            {ticket.assigned_to_name ? <MetaRow label="Assigned To" value={ticket.assigned_to_name} /> : null}
            {ticket.resolution_notes ? <MetaRow label="Resolution"  value={ticket.resolution_notes} last /> : null}
          </Card>

          {status !== 'resolved' && status !== 'closed' && canResolve && (
            <Card>
              <Text style={styles.fieldLabel}>Resolution Notes</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe the resolution..."
                placeholderTextColor={theme.colors.muted}
                multiline
                numberOfLines={3}
              />
              <Button
                title="Mark Resolved"
                onPress={() => Alert.alert('Resolve Ticket', 'Mark this ticket as resolved?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Resolve', onPress: () => resolveMut.mutate() },
                ])}
                loading={resolveMut.isPending}
                style={{ marginTop: 12 }}
              />
            </Card>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  priorityBar: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  priorityText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    padding: 10, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface,
    height: 80, textAlignVertical: 'top',
  },
});
