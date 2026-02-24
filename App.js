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

const BASE4_PRIORITY = [
  { dir: 'N', defId: '001' },
  { dir: 'E', defId: '002' },
  { dir: 'S', defId: '003' },
  { dir: 'W', defId: '004' },
];

const defById = Object.fromEntries(ELEMENT_DEFS.map((d) => [d.id, d]));
const sortCombo = (a, b) => [a, b].sort().join('+');
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const getToday = () => new Date().toISOString().slice(0, 10);

function parseDeviceType(width, height) {
  const isPortrait = height >= width;
  return isPortrait && width < 700 ? 'phone' : 'pad';
}

export default function App() {
  const [layout, setLayout] = useState(Dimensions.get('window'));
  const [instances, setInstances] = useState([]);
  const [discoveredByCombine, setDiscoveredByCombine] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [lastWorkspaceTapPoint, setLastWorkspaceTapPoint] = useState(null);
  const [mode, setMode] = useState('NORMAL');
  const [draggingId, setDraggingId] = useState(null);
  const [showCompendium, setShowCompendium] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [adHint, setAdHint] = useState({ date: getToday(), used: 0, limit: 3 });

  const lastTapRef = useRef(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const loadedRef = useRef(false);

  const deviceType = parseDeviceType(layout.width, layout.height);
  const maxElements = deviceType === 'phone' ? 80 : 120;
  const baseSpawnRadius = Math.max(deviceType === 'phone' ? 56 : 72, ELEMENT_RADIUS * (deviceType === 'phone' ? 2.4 : 2.8));

  const discoveredSet = useMemo(
    () => new Set([...ELEMENT_DEFS.filter((d) => d.discoveredByDefault).map((d) => d.id), ...discoveredByCombine]),
    [discoveredByCombine]
  );

  const compendiumList = useMemo(
    () => ELEMENT_DEFS.filter((d) => discoveredSet.has(d.id)).sort((a, b) => a.id.localeCompare(b.id)),
    [discoveredSet]
  );

  const remain = maxElements - instances.length;

  const trashZoneRect = useMemo(() => {
    if (mode !== 'DRAGGING') return null;
    if (deviceType === 'phone') {
      return { x: 0, y: 0, width: 86, height: layout.height };
    }
    return { x: 0, y: layout.height - 86, width: layout.width, height: 86 };
  }, [mode, deviceType, layout.height, layout.width]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setLayout(window));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        loadedRef.current = true;
        return;
      }
      const saved = JSON.parse(raw);
      setDiscoveredByCombine(saved.collection?.discoveredByCombine ?? []);
      setFavorites((saved.collection?.favorites ?? []).slice(0, 10));
      setLastWorkspaceTapPoint(saved.ui?.lastWorkspaceTapPoint ?? null);
      const hint = saved.adHint ?? { date: getToday(), used: 0, limit: 3 };
      setAdHint(hint.date === getToday() ? hint : { date: getToday(), used: 0, limit: 3 });
      const loadedInstances = (saved.canvas?.instances ?? []).map((it) => ({
        instanceId: it.instanceId,
        definitionId: it.definitionId,
        x: it.xNorm * layout.width,
        y: it.yNorm * layout.height,
      }));
      setInstances(loadedInstances);
      loadedRef.current = true;
    })();
  }, [layout.height, layout.width]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(async () => {
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
        ui: {
          lastWorkspaceTapPoint,
        },
        adHint,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, 450);

    return () => clearTimeout(t);
  }, [instances, discoveredByCombine, favorites, lastWorkspaceTapPoint, adHint, layout.height, layout.width]);

  const isInsideWorkspace = (x, y) => x >= ELEMENT_RADIUS && x <= layout.width - ELEMENT_RADIUS && y >= ELEMENT_RADIUS && y <= layout.height - ELEMENT_RADIUS;

  const isCollision = (x, y, sourceList = instances, exceptId = null) =>
    sourceList.some((it) => it.instanceId !== exceptId && Math.hypot(it.x - x, it.y - y) < MIN_GAP);

  const nearbyPlacement = (origin, sourceList = instances, exceptId = null, startRadius = baseSpawnRadius) => {
    const angles = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (deg * Math.PI) / 180);
    const step = Math.max(12, ELEMENT_RADIUS * 0.5);
    const dMax = 3.5 * baseSpawnRadius;

    for (let radius = startRadius; radius <= dMax; radius += step) {
      for (const angle of angles) {
        const px = origin.x + Math.cos(angle) * radius;
        const py = origin.y + Math.sin(angle) * radius;
        if (!isInsideWorkspace(px, py)) continue;
        if (isCollision(px, py, sourceList, exceptId)) continue;
        return { x: px, y: py };
      }
    }
    return null;
  };

  const spawnOne = (definitionId, anchor, sourceList = instances) => {
    if (sourceList.length >= maxElements) return { ok: false, reason: 'limit' };
    const origin = anchor ?? lastWorkspaceTapPoint ?? { x: layout.width / 2, y: layout.height / 2 };
    const pos = nearbyPlacement(origin, sourceList);
    if (!pos) return { ok: false, reason: 'space' };
    const newInst = { instanceId: uid(), definitionId, x: pos.x, y: pos.y };
    setInstances((prev) => [...prev, newInst]);
    return { ok: true };
  };

  const findTopElementAt = (x, y, source = instances) => {
    for (let i = source.length - 1; i >= 0; i -= 1) {
      const it = source[i];
      if (Math.hypot(it.x - x, it.y - y) <= ELEMENT_RADIUS) return it;
    }
    return null;
  };

  const spawnBase4OnDoubleTap = (x, y) => {
    if (remain <= 0) {
      Alert.alert('실패', '캔버스가 가득 찼어요');
      return;
    }

    const offsetMap = {
      N: { x: 0, y: -baseSpawnRadius },
      E: { x: baseSpawnRadius, y: 0 },
      S: { x: 0, y: baseSpawnRadius },
      W: { x: -baseSpawnRadius, y: 0 },
    };

    let successCount = 0;
    let working = [...instances];
    for (const item of BASE4_PRIORITY.slice(0, Math.min(4, remain))) {
      const anchor = { x: x + offsetMap[item.dir].x, y: y + offsetMap[item.dir].y };
      const placed = nearbyPlacement(anchor, working, null, baseSpawnRadius * 0.6);
      if (!placed) continue;
      const newInst = { instanceId: uid(), definitionId: item.defId, x: placed.x, y: placed.y };
      working.push(newInst);
      successCount += 1;
    }

    if (successCount === 0) {
      Alert.alert('실패', '놓을 공간이 없어요');
      return;
    }

    setInstances(working);
    if (successCount < 4) {
      Alert.alert('안내', `공간 부족으로 ${successCount}개만 생성됨`);
    }
  };

  const attemptCombineAtDrop = (sourceId, dropX, dropY) => {
    setInstances((prev) => {
      const source = prev.find((it) => it.instanceId === sourceId);
      if (!source) return prev;

      const target = [...prev]
        .reverse()
        .find((it) => it.instanceId !== sourceId && Math.hypot(it.x - dropX, it.y - dropY) <= ELEMENT_RADIUS);

      if (!target) return prev;

      const comboKey = sortCombo(source.definitionId, target.definitionId);
      const resultId = RECIPES[comboKey];
      if (!resultId) {
        Alert.alert('실패', '아직 발견되지 않은 조합');
        return prev;
      }

      const withoutInputs = prev.filter((it) => it.instanceId !== sourceId && it.instanceId !== target.instanceId);
      const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
      const pos = nearbyPlacement(center, withoutInputs, null, baseSpawnRadius * 0.5);

      if (!pos) {
        Alert.alert('실패', '결과를 놓을 공간이 없어요');
        return prev;
      }

      if (!discoveredByCombine.includes(resultId)) {
        setDiscoveredByCombine((curr) => [...curr, resultId]);
      }

      return [...withoutInputs, { instanceId: uid(), definitionId: resultId, x: pos.x, y: pos.y }];
    });
  };

  const handleWorkspacePress = (x, y) => {
    if (mode === 'DRAGGING') return;

    setLastWorkspaceTapPoint({ x, y });
    const now = Date.now();
    const hit = findTopElementAt(x, y);
    const targetKey = hit ? `el:${hit.instanceId}` : 'empty';
    const prevTap = lastTapRef.current;

    if (
      prevTap &&
      prevTap.targetKey === targetKey &&
      now - prevTap.time <= DOUBLE_TAP_TIME_MS &&
      Math.hypot(prevTap.x - x, prevTap.y - y) <= TAP_SLOP_DP
    ) {
      lastTapRef.current = null;
      if (hit) {
        const res = spawnOne(hit.definitionId, { x: hit.x, y: hit.y });
        if (!res.ok) {
          Alert.alert('실패', res.reason === 'limit' ? '캔버스가 가득 찼어요' : '놓을 공간이 없어요');
        }
      } else {
        spawnBase4OnDoubleTap(x, y);
      }
      return;
    }

    lastTapRef.current = { x, y, time: now, targetKey };
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
    const res = spawnOne(defId, lastWorkspaceTapPoint ?? { x: layout.width / 2, y: layout.height / 2 });
    if (!res.ok) {
      Alert.alert('실패', res.reason === 'limit' ? '캔버스가 가득 찼어요' : '놓을 공간이 없어요');
    }
  };

  const hintCandidates = useMemo(() => {
    const discovered = new Set([...ELEMENT_DEFS.filter((d) => d.discoveredByDefault).map((d) => d.id), ...discoveredByCombine]);
    return Object.entries(RECIPES)
      .map(([k, result]) => ({ pair: k.split('+'), result }))
      .filter((r) => !discovered.has(r.result) && discovered.has(r.pair[0]) && discovered.has(r.pair[1]));
  }, [discoveredByCombine]);

  const useRewardedHint = () => {
    const normalized = adHint.date === getToday() ? adHint : { date: getToday(), used: 0, limit: 3 };
    if (normalized.used >= normalized.limit) {
      Alert.alert('힌트 제한', '오늘은 힌트를 모두 사용했어요.');
      setAdHint(normalized);
      return;
    }

    const candidate = hintCandidates[0];
    if (!candidate) {
      Alert.alert('힌트', '현재 가능한 미발견 조합이 없어요.');
      return;
    }

    setAdHint({ ...normalized, used: normalized.used + 1 });
    Alert.alert('힌트', `${defById[candidate.pair[0]].name} + ${defById[candidate.pair[1]].name} = ${defById[candidate.result].name}`);
  };

  const getElementPanResponder = (instance) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.hypot(g.dx, g.dy) > DRAG_START_DP,
      onPanResponderGrant: () => {
        dragStartPosRef.current = { x: instance.x, y: instance.y };
        setDraggingId(instance.instanceId);
        setMode('DRAGGING');
      },
      onPanResponderMove: (_, g) => {
        setInstances((prev) =>
          prev.map((it) => {
            if (it.instanceId !== instance.instanceId) return it;
            const nx = Math.max(ELEMENT_RADIUS, Math.min(layout.width - ELEMENT_RADIUS, dragStartPosRef.current.x + g.dx));
            const ny = Math.max(ELEMENT_RADIUS, Math.min(layout.height - ELEMENT_RADIUS, dragStartPosRef.current.y + g.dy));
            return { ...it, x: nx, y: ny };
          })
        );
      },
      onPanResponderRelease: (_, g) => {
        const dropX = Math.max(ELEMENT_RADIUS, Math.min(layout.width - ELEMENT_RADIUS, dragStartPosRef.current.x + g.dx));
        const dropY = Math.max(ELEMENT_RADIUS, Math.min(layout.height - ELEMENT_RADIUS, dragStartPosRef.current.y + g.dy));

        if (
          trashZoneRect &&
          dropX >= trashZoneRect.x &&
          dropX <= trashZoneRect.x + trashZoneRect.width &&
          dropY >= trashZoneRect.y &&
          dropY <= trashZoneRect.y + trashZoneRect.height
        ) {
          setInstances((prev) => prev.filter((it) => it.instanceId !== instance.instanceId));
        } else {
          attemptCombineAtDrop(instance.instanceId, dropX, dropY);
        }

        setDraggingId(null);
        setMode('NORMAL');
      },
      onPanResponderTerminate: () => {
        setDraggingId(null);
        setMode('NORMAL');
      },
    });

  const quickSlots = [...Array(10)].map((_, idx) => favorites[idx] ?? null);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.workspace}
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          handleWorkspacePress(locationX, locationY);
        }}
      >
        {instances.map((it) => {
          const def = defById[it.definitionId];
          return (
            <View
              key={it.instanceId}
              {...getElementPanResponder(it).panHandlers}
              style={[
                styles.element,
                {
                  left: it.x - ELEMENT_RADIUS,
                  top: it.y - ELEMENT_RADIUS,
                  opacity: draggingId === it.instanceId ? 0.92 : 1,
                },
              ]}
            >
              <Text style={styles.elementEmoji}>{def?.emoji ?? '❓'}</Text>
              <Text style={styles.elementLabel}>{def?.name ?? '알수없음'}</Text>
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
            <Pressable key={`quick-${idx}`} style={styles.barBtn} onPress={() => defId && quickSpawn(defId)}>
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
                  <Pressable style={styles.rowBtn} onPress={() => toggleFavorite(d.id)}>
                    <Text>{favorites.includes(d.id) ? '★' : '☆'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.rowBtn}
                    onPress={() => {
                      setShowCompendium(false);
                      quickSpawn(d.id);
                    }}
                  >
                    <Text>배치</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable style={styles.closeBtn} onPress={() => setShowCompendium(false)}>
              <Text>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showHelp} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>도움말</Text>
            <Text>• 빈 공간 더블탭: 기본 4요소 생성</Text>
            <Text>• 요소 더블탭: 요소 복제</Text>
            <Text>• 드래그 후 드롭: 조합 시도</Text>
            <Text>• 드래그 중 바 영역에 드롭: 삭제</Text>
            <Text>{`힌트 사용량: ${adHint.date === getToday() ? adHint.used : 0}/${adHint.limit}`}</Text>
            <Pressable style={styles.closeBtn} onPress={useRewardedHint}>
              <Text>광고 보고 힌트 보기</Text>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => setShowHelp(false)}>
              <Text>닫기</Text>
            </Pressable>
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
    borderColor: '#263238',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elementEmoji: { fontSize: 15 },
  elementLabel: { fontSize: 10 },
  buttonBar: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 8,
    gap: 6,
  },
  buttonBarPhone: {
    top: 0,
    bottom: 0,
    left: 0,
    width: 86,
    justifyContent: 'center',
  },
  buttonBarPad: {
    left: 0,
    right: 0,
    bottom: 0,
    height: 86,
    flexDirection: 'row',
    alignItems: 'center',
  },
  barBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 50,
    alignItems: 'center',
  },
  barBtnText: { fontWeight: '700' },
  trashZone: {
    position: 'absolute',
    backgroundColor: 'rgba(170, 35, 35, 0.76)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashText: { color: '#fff', fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#ddd',
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  rowRight: { flexDirection: 'row', gap: 8 },
  rowBtn: { backgroundColor: '#eee', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  closeBtn: { backgroundColor: '#eee', borderRadius: 8, padding: 10, alignItems: 'center' },
});
