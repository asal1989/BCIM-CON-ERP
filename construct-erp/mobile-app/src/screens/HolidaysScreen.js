import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { holidaysAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

const TYPE_COLOR = { national: '#2563EB', festival: '#D97706', restricted: '#7C3AED' };

export default function HolidaysScreen() {
  const year = dayjs().year();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => holidaysAPI.list(year).then(r => r.data?.data ?? r.data ?? []),
  });

  const today = dayjs().format('YYYY-MM-DD');
  const items = (data || []).sort((a, b) => new Date(a.holiday_date) - new Date(b.holiday_date));
  const upcoming = items.filter(h => dayjs(h.holiday_date).format('YYYY-MM-DD') >= today);
  const past = items.filter(h => dayjs(h.holiday_date).format('YYYY-MM-DD') < today);
  const ordered = [...upcoming, ...past];

  return (
    <Screen>
      <ScreenHeader title="Holiday Calendar" subtitle={String(year)} showBack />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load holidays" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="calendar-star" title="No holidays configured" />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}
          renderItem={({ item }) => {
            const isPast = dayjs(item.holiday_date).format('YYYY-MM-DD') < today;
            const color = TYPE_COLOR[item.holiday_type] || theme.colors.primary;
            return (
              <Card style={[styles.row, isPast && styles.rowPast]}>
                <View style={[styles.dateBox, { backgroundColor: `${color}1A` }]}>
                  <Text style={[styles.dateDay, { color }]}>{dayjs(item.holiday_date).format('DD')}</Text>
                  <Text style={[styles.dateMonth, { color }]}>{dayjs(item.holiday_date).format('MMM')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>{dayjs(item.holiday_date).format('dddd')} · {item.holiday_type}</Text>
                </View>
                {!isPast && dayjs(item.holiday_date).format('YYYY-MM-DD') === today && (
                  <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>
                )}
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowPast: { opacity: 0.5 },
  dateBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '800' },
  dateMonth: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  name: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.muted, marginTop: 3, textTransform: 'capitalize' },
  todayBadge: { backgroundColor: theme.colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  todayBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
