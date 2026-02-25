import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DOUBLE_TAP_TIME_MS = 280;
const TAP_SLOP_DP = 10;
const DRAG_START_DP = 12;
const ELEMENT_RADIUS = 22;
const SAFE_MARGIN = 8;
const MIN_GAP = ELEMENT_RADIUS * 2 + SAFE_MARGIN;
const STORAGE_KEY = 'genesis-v1-state';

const ELEMENT_DEFS = [
  { id: '001', name: '불', emoji: '🔥', discoveredByDefault: true },
  { id: '002', name: '물', emoji: '💧', discoveredByDefault: true },
  { id: '003', name: '바람', emoji: '💨', discoveredByDefault: true },
  { id: '004', name: '땅', emoji: '🪨', discoveredByDefault: true },
  { id: '101', name: '수증기', emoji: '☁️', discoveredByDefault: false },
  { id: '102', name: '진흙', emoji: '🟫', discoveredByDefault: false },
  { id: '103', name: '용암', emoji: '🌋', discoveredByDefault: false },
  { id: '104', name: '폭풍', emoji: '⛈️', discoveredByDefault: false },
];

const RECIPES = {
  '001+002': '101',
  '002+004': '102',
  '001+004': '103',
  '001+003': '104',
};

const BASE4_MAP = [
  { dir: 'N', defId: '001' },
  { dir: 'E', defId: '002' },
  { dir: 'S', defId: '003' },
  { dir: 'W', defId: '004' },
];

const defById = Object.fromEntries(ELEMENT_DEFS.map((d) => [d.id, d]));

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sortCombo = (a, b) => [a, b].sort().join('+');

const today = () => new Date().toISOString().slice(0, 10);

const defaultAdHint = () => ({ date: today(), used: 0, limit: 3 });

function parseAspect(width, height) {
  const portrait = height >= width;
  return portrait && width < 700 ? 'phone' : 'pad';
}

export default function App() {
  const [layout, setLayout] = useState(Dimensions.get('window'));
  const [instances, setInstances] = useState([]);
  const [discoveredByCombine, setDiscoveredByCombine] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [lastTap, setLastTap] = useState(null);
  const [mode, setMode] = useState('NORMAL');
  const [draggingId, setDraggingId] = useState(null);
  const [showCompendium, setShowCompendium] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [adHint, setAdHint] = useState(defaultAdHint());

  const lastTouchRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const deviceType = parseAspect(layout.width, layout.height);
  const maxElements = deviceType === 'phone' ? 80 : 120;
  const baseSpawnRadius = useMemo(
    () => Math.max(deviceType === 'phone' ? 56 : 72, ELEMENT_RADIUS * (deviceType === 'phone' ? 2.4 : 2.8)),
    [deviceType]
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setLayout(window));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        setDiscoveredByCombine(saved.collection?.discoveredByCombine ?? []);
        setFavorites(saved.collection?.favorites?.slice(0, 10) ?? []);
        setLastTap(saved.ui?.lastWorkspaceTapPoint ?? null);
        const ad = saved.adHint ?? defaultAdHint();
        setAdHint(ad.date === today() ? ad : defaultAdHint());
        const loaded = (saved.canvas?.instances ?? []).map((it) => ({
          ...it,
          x: Number(it.xNorm) * layout.width,
          y: Number(it.yNorm) * layout.height,
        }));
        setInstances(loaded.filter((it) => Number.isFinite(it.x) && Number.isFinite(it.y)));
      } catch (err) {
        console.error('[boot] failed to restore saved state', err);
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    })();
  }, [layout.width, layout.height]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!layout.width || !layout.height) return;
      try {
        const payload = {
          canvas: {
            instances: instances.map((it) => ({
              instanceId: it.instanceId,
              definitionId: it.definitionId,
              xNorm: it.x / layout.width,
              yNorm: it.y / layout.height,
            })),
          },
          collection: {
            discoveredByCombine,
            favorites,
          },
          ui: { lastWorkspaceTapPoint: lastTap },
          adHint,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.error('[boot] failed to persist state', err);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [instances, discoveredByCombine, favorites, lastTap, adHint, layout.width, layout.height]);

  const discoveredSet = useMemo(
    () => new Set([...ELEMENT_DEFS.filter((d) => d.discoveredByDefault).map((d) => d.id), ...discoveredByCombine]),
    [discoveredByCombine]
  );

  const compendiumList = useMemo(
    () => ELEMENT_DEFS.filter((d) => discoveredSet.has(d.id)).sort((a, b) => a.id.localeCompare(b.id)),
    [discoveredSet]
  );

  const remain = maxElements - instances.length;

  const barRect = useMemo(() => {
    if (mode !== 'DRAGGING') return null;
    if (deviceType === 'phone') {
      return { x: 0, y: 0, width: 86, height: layout.height };
    }
    return { x: 0, y: layout.height - 86, width: layout.width, height: 86 };
  }, [mode, deviceType, layout.width, layout.height]);

  const isInsideWorkspace = (x, y) => x > ELEMENT_RADIUS && x < layout.width - ELEMENT_RADIUS && y > ELEMENT_RADIUS && y < layout.height - ELEMENT_RADIUS;

  const collides = (x, y, exceptId = null, list = instances) =>
    list.some((it) => it.instanceId !== exceptId && Math.hypot(it.x - x, it.y - y) < MIN_GAP);

  const nearbyPlacement = (origin, list = instances, exceptId = null) => {
    const angles = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => (d * Math.PI) / 180);
    const step = Math.max(12, ELEMENT_RADIUS * 0.5);
    const dMax = 3.5 * baseSpawnRadius;
    for (let d = baseSpawnRadius; d <= dMax; d += step) {
      for (const a of angles) {
        const x = origin.x + Math.cos(a) * d;
        const y = origin.y + Math.sin(a) * d;
        if (!isInsideWorkspace(x, y)) continue;
        if (collides(x, y, exceptId, list)) continue;
        return { x, y };
      }
    }
    return null;
  };

  const spawnOne = (definitionId, anchor) => {
    if (instances.length >= maxElements) return false;
    const pos = nearbyPlacement(anchor ?? lastTap ?? { x: layout.width / 2, y: layout.height / 2 });
    if (!pos) return false;
    setInstances((prev) => [...prev, { instanceId: uid(), definitionId, x: pos.x, y: pos.y }]);
    return true;
  };

  const spawnBase4ByDoubleTap = (x, y) => {
    if (remain <= 0) return Alert.alert('실패', '캔버스가 가득 찼어요');
    const dirOffset = {
      N: { x: 0, y: -baseSpawnRadius },
      E: { x: baseSpawnRadius, y: 0 },
      S: { x: 0, y: baseSpawnRadius },
      W: { x: -baseSpawnRadius, y: 0 },
    };
    let success = 0;
    for (const row of BASE4_MAP.slice(0, Math.min(4, remain))) {
      const t = { x: x + dirOffset[row.dir].x, y: y + dirOffset[row.dir].y };
      const ok = spawnOne(row.defId, t);
      if (ok) success += 1;
    }
    if (success === 0) Alert.alert('실패', '놓을 공간이 없어요');
    else if (success < 4) Alert.alert('안내', `공간 부족으로 ${success}개만 생성됨`);
  };

  const handleWorkspaceTap = (x, y) => {
    setLastTap({ x, y });
    const now = Date.now();
    const hit = findTopElementAt(x, y);
    const target = hit ? `el:${hit.instanceId}` : 'empty';
    const prev = lastTouchRef.current;
    if (
      prev &&
      now - prev.time <= DOUBLE_TAP_TIME_MS &&
      Math.hypot(prev.x - x, prev.y - y) <= TAP_SLOP_DP &&
      prev.target === target
    ) {
      lastTouchRef.current = null;
      if (hit) {
        const ok = spawnOne(hit.definitionId, { x: hit.x, y: hit.y });
        if (!ok) Alert.alert('실패', instances.length >= maxElements ? '캔버스가 가득 찼어요' : '놓을 공간이 없어요');
      } else {
        spawnBase4ByDoubleTap(x, y);
      }
      return;
    }
    lastTouchRef.current = { x, y, time: now, target };
  };

  const findTopElementAt = (x, y) => {
    for (let i = instances.length - 1; i >= 0; i -= 1) {
      const it = instances[i];
      if (Math.hypot(it.x - x, it.y - y) <= ELEMENT_RADIUS) return it;
    }
    return null;
  };

  const attemptCombine = (sourceId, dropX, dropY) => {
    const source = instances.find((i) => i.instanceId === sourceId);
    if (!source) return;
    const target = instances
      .filter((i) => i.instanceId !== sourceId)
      .find((i) => Math.hypot(i.x - dropX, i.y - dropY) <= ELEMENT_RADIUS);
    if (!target) return;

    const comboKey = sortCombo(source.definitionId, target.definitionId);
    const resultId = RECIPES[comboKey];
    if (!resultId) {
      Alert.alert('실패', '아직 발견되지 않은 조합');
      return;
    }

    const withoutInputs = instances.filter((i) => i.instanceId !== sourceId && i.instanceId !== target.instanceId);
    const middle = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
    const finalPos = nearbyPlacement(middle, withoutInputs);
    if (!finalPos) {
      Alert.alert('실패', '결과를 놓을 공간이 없어요');
      return;
    }

    setInstances([...withoutInputs, { instanceId: uid(), definitionId: resultId, x: finalPos.x, y: finalPos.y }]);
    if (!discoveredByCombine.includes(resultId)) {
      setDiscoveredByCombine((prev) => [...prev, resultId]);
    }
  };

  const toggleFavorite = (defId) => {
    setFavorites((prev) => {
      if (prev.includes(defId)) return prev.filter((id) => id !== defId);
      if (prev.length >= 10) {
        Alert.alert('실패', '즐겨찾기는 최대 10개까지 가능해요');
        return prev;
      }
      return [...prev, defId];
    });
  };

  const quickSpawn = (defId) => {
    const ok = spawnOne(defId, lastTap ?? { x: layout.width / 2, y: layout.height / 2 });
    if (!ok) Alert.alert('실패', instances.length >= maxElements ? '캔버스가 가득 찼어요' : '놓을 공간이 없어요');
  };

  const hintCandidates = useMemo(() => {
    const discovered = new Set([...ELEMENT_DEFS.filter((d) => d.discoveredByDefault).map((d) => d.id), ...discoveredByCombine]);
    return Object.entries(RECIPES)
      .map(([k, v]) => ({ key: k, result: v, pair: k.split('+') }))
      .filter((r) => !discovered.has(r.result) && discovered.has(r.pair[0]) && discovered.has(r.pair[1]));
  }, [discoveredByCombine]);

  const useRewardedHint = () => {
    const normalized = adHint.date === today() ? adHint : defaultAdHint();
    if (normalized.used >= normalized.limit) {
      Alert.alert('힌트 제한', '오늘은 힌트를 모두 사용했어요.');
      setAdHint(normalized);
      return;
    }
    const cand = hintCandidates[0];
    if (!cand) {
      Alert.alert('힌트', '현재 가능한 미발견 조합이 없어요.');
      return;
    }
    setAdHint({ ...normalized, used: normalized.used + 1 });
    const a = defById[cand.pair[0]].name;
    const b = defById[cand.pair[1]].name;
    const r = defById[cand.result].name;
    Alert.alert('힌트', `${a} + ${b} = ${r}`);
  };

  const elementResponder = (instance) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.hypot(g.dx, g.dy) > DRAG_START_DP,
      onPanResponderGrant: (evt) => {
        setDraggingId(instance.instanceId);
        setMode('DRAGGING');
        dragStartPos.current = { x: instance.x, y: instance.y };
      },
      onPanResponderMove: (_, g) => {
        setInstances((prev) =>
          prev.map((it) =>
            it.instanceId === instance.instanceId
              ? {
                  ...it,
                  x: Math.min(layout.width - ELEMENT_RADIUS, Math.max(ELEMENT_RADIUS, dragStartPos.current.x + g.dx)),
                  y: Math.min(layout.height - ELEMENT_RADIUS, Math.max(ELEMENT_RADIUS, dragStartPos.current.y + g.dy)),
                }
              : it
          )
        );
      },
      onPanResponderRelease: () => {
        const me = instances.find((i) => i.instanceId === instance.instanceId);
        if (me && barRect && me.x >= barRect.x && me.x <= barRect.x + barRect.width && me.y >= barRect.y && me.y <= barRect.y + barRect.height) {
          setInstances((prev) => prev.filter((i) => i.instanceId !== instance.instanceId));
        } else if (me) {
          attemptCombine(instance.instanceId, me.x, me.y);
        }
        setDraggingId(null);
        setMode('NORMAL');
      },
      onPanResponderTerminate: () => {
        setDraggingId(null);
        setMode('NORMAL');
      },
    });

  const quickSlots = [...Array(10)].map((_, i) => favorites[i] ?? null);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.workspace}
        onPress={(e) => {
          if (mode === 'DRAGGING') return;
          const { locationX, locationY } = e.nativeEvent;
          handleWorkspaceTap(locationX, locationY);
        }}
      >
        {instances.map((it) => {
          const def = defById[it.definitionId];
          return (
            <View
              key={it.instanceId}
              {...elementResponder(it).panHandlers}
              style={[styles.element, { left: it.x - ELEMENT_RADIUS, top: it.y - ELEMENT_RADIUS, opacity: draggingId === it.instanceId ? 0.9 : 1 }]}
            >
              <Text style={styles.elementEmoji}>{def?.emoji ?? '❓'}</Text>
              <Text style={styles.elementLabel}>{def?.name}</Text>
            </View>
          );
        })}
      </Pressable>

      {mode === 'NORMAL' ? (
        <View style={[styles.buttonBar, deviceType === 'phone' ? styles.buttonBarPhone : styles.buttonBarPad]}>
          <Pressable style={styles.barBtn} onPress={() => setShowCompendium(true)}>
            <Text style={styles.barBtnText}>도감</Text>
          </Pressable>
          {quickSlots.map((defId, idx) => (
            <Pressable key={`q-${idx}`} style={styles.barBtn} onPress={() => defId && quickSpawn(defId)}>
              <Text style={styles.barBtnText}>{defId ? defById[defId].emoji : '+'}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.barBtn} onPress={() => setShowHelp(true)}>
            <Text style={styles.barBtnText}>도움</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.trashZone, deviceType === 'phone' ? styles.buttonBarPhone : styles.buttonBarPad]}>
          <Text style={styles.trashText}>🗑️ 놓으면 삭제</Text>
        </View>
      )}

      <Modal visible={showCompendium} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>도감</Text>
            {compendiumList.map((d) => (
              <View key={d.id} style={styles.row}>
                <Text>{`${d.id} ${d.emoji} ${d.name}`}</Text>
                <View style={styles.rowRight}>
                  <Pressable onPress={() => toggleFavorite(d.id)} style={styles.rowBtn}><Text>{favorites.includes(d.id) ? '★' : '☆'}</Text></Pressable>
                  <Pressable
                    onPress={() => {
                      setShowCompendium(false);
                      quickSpawn(d.id);
                    }}
                    style={styles.rowBtn}
                  >
                    <Text>배치</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable style={styles.closeBtn} onPress={() => setShowCompendium(false)}><Text>닫기</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showHelp} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>도움말</Text>
            <Text>• 빈 공간 더블탭: 기본 4요소 생성</Text>
            <Text>• 요소 더블탭: 복제</Text>
            <Text>• 드래그/드롭: 조합</Text>
            <Text>• 드래그 중 바 영역 드롭: 삭제</Text>
            <Text>{`힌트 사용량: ${adHint.date === today() ? adHint.used : 0}/${adHint.limit}`}</Text>
            <Pressable style={styles.closeBtn} onPress={useRewardedHint}><Text>광고 보고 힌트 보기</Text></Pressable>
            <Pressable style={styles.closeBtn} onPress={() => setShowHelp(false)}><Text>닫기</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#d7f2ff' },
  workspace: { flex: 1 },
  element: {
    position: 'absolute',
    width: ELEMENT_RADIUS * 2,
    height: ELEMENT_RADIUS * 2,
    borderRadius: ELEMENT_RADIUS,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  elementEmoji: { fontSize: 16 },
  elementLabel: { fontSize: 10 },
  buttonBar: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.35)',
    gap: 6,
    padding: 8,
  },
  buttonBarPhone: { left: 0, top: 0, bottom: 0, width: 86, justifyContent: 'center' },
  buttonBarPad: { left: 0, right: 0, bottom: 0, height: 86, flexDirection: 'row', alignItems: 'center' },
  barBtn: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, minWidth: 50, alignItems: 'center' },
  barBtnText: { fontWeight: '600' },
  trashZone: {
    position: 'absolute',
    backgroundColor: 'rgba(180,20,20,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashText: { color: '#fff', fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '88%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 8 },
  rowRight: { flexDirection: 'row', gap: 8 },
  rowBtn: { backgroundColor: '#eee', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  closeBtn: { backgroundColor: '#eee', borderRadius: 8, padding: 10, alignItems: 'center' },
});
