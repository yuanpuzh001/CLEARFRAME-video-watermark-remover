import { useEffect, useRef, useState } from "react";
import { Activity, LockKeyhole, Sparkles } from "lucide-react";
import { BatchQueue } from "../components/BatchQueue";
import { UploadZone } from "../components/UploadZone";
import { VideoPreview } from "../components/VideoPreview";
import { ProcessPanel } from "../components/ProcessPanel";
import { ResultPanel } from "../components/ResultPanel";
import { WorkflowNavigation } from "../components/WorkflowNavigation";
import type { SidecarConnectionState } from "../components/ProcessingModeControl";
import { useBatchVideoProcessor, type ProcessingMode } from "../hooks/useBatchVideoProcessor";
import { checkSidecar, getVeoCliStatus, pairSidecar, selectVeoCli, type SidecarHealth, type VeoCliStatus } from "../lib/sidecar/client";
import { WORKFLOW_SECTIONS } from "../lib/ui/workflowLabels";
import { DEFAULT_REGION } from "../lib/video/region";
import { createResultArchive, downloadBlob } from "../lib/video/resultArchive";
import { cleanOutputName, loadVideoAssets } from "../lib/video/validation";
import type { NormalizedRegion, ProcessingState, VideoQueueItem } from "../types/video";

export function App() {
  const [items, setItems] = useState<VideoQueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("browser");
  const [sidecarUrl, setSidecarUrl] = useState("http://127.0.0.1:3210");
  const [sidecarState, setSidecarState] = useState<SidecarConnectionState>("idle");
  const [sidecarMessage, setSidecarMessage] = useState("启动 sidecar 后进行配对");
  const [sidecarPairingCode, setSidecarPairingCode] = useState("");
  const [sidecarHealth, setSidecarHealth] = useState<SidecarHealth | null>(null);
  const [veoCliStatus, setVeoCliStatus] = useState<VeoCliStatus | null>(null);
  const [veoSelecting, setVeoSelecting] = useState(false);
  const [veoSelectionError, setVeoSelectionError] = useState("");
  const [veoForceAllFrames, setVeoForceAllFrames] = useState(true);
  const itemsRef = useRef<VideoQueueItem[]>([]);
  const sidecarConnection = sidecarState === "ready"
    ? { baseUrl: sidecarUrl }
    : undefined;
  const processor = useBatchVideoProcessor({
    mode: processingMode,
    sidecar: sidecarConnection,
    veoForceAllFrames,
  });
  const activeItem = items.find((item) => item.id === activeId) ?? items[0] ?? null;
  const activeState = activeItem ? processor.states[activeItem.id] : undefined;
  const completed = items.filter((item) => processor.states[item.id]?.phase === "success").length;
  const failed = items.filter((item) => processor.states[item.id]?.phase === "error").length;
  const cancelled = items.filter((item) => processor.states[item.id]?.phase === "cancelled").length;
  const remaining = items.length - completed;
  const runningItem = items.find((item) => {
    const phase = processor.states[item.id]?.phase;
    return phase === "loading-engine" || phase === "processing";
  });
  const totalProgress = items.length === 0 ? 0 : items.reduce((sum, item) => {
    const state = processor.states[item.id];
    return sum + (state?.phase === "success" ? 1 : state?.progress ?? 0);
  }, 0) / items.length;
  const processState: ProcessingState = (() => {
    if (processor.isRunning) {
      const runningState = runningItem ? processor.states[runningItem.id] : undefined;
      const position = runningItem ? items.findIndex(({ id }) => id === runningItem.id) + 1 : completed + 1;
      return {
        phase: runningState?.phase === "processing" ? "processing" : "loading-engine",
        progress: totalProgress,
        message: runningItem
          ? `${runningState?.message || "正在处理"} · ${runningItem.asset.file.name} · ${position}/${items.length}`
          : "队列准备中…",
      };
    }
    if (items.length > 0 && completed === items.length) {
      return { phase: "success", progress: 1, message: `全部 ${items.length} 个视频处理完成` };
    }
    if (failed > 0) {
      return {
        phase: "error",
        progress: totalProgress,
        message: `已完成 ${completed}/${items.length}`,
        error: `${failed} 个视频处理失败，可保留成功结果并重试失败项。`,
      };
    }
    if (cancelled > 0) {
      return { phase: "cancelled", progress: totalProgress, message: `批量处理已取消 · 已完成 ${completed}/${items.length}` };
    }
    return { phase: "idle", progress: totalProgress, message: `${items.length} 个视频等待处理` };
  })();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.asset.url);
  }, []);

  const handleSelect = async (files: File[]) => {
    setError("");
    setLoading(true);
    try {
      const { assets, failures } = await loadVideoAssets(files);
      const nextItems = assets.map((asset) => ({
        id: crypto.randomUUID(),
        asset,
        region: DEFAULT_REGION,
      }));
      setItems((current) => [...current, ...nextItems]);
      setActiveId((current) => current ?? nextItems[0]?.id ?? null);
      if (failures.length > 0) {
        setError(failures.map(({ file, message }) => `${file.name}：${message}`).join("；"));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量视频读取失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setError("");
    processor.cancel();
    processor.resetAll();
    for (const item of items) URL.revokeObjectURL(item.asset.url);
    setItems([]);
    setActiveId(null);
  };

  const handleRemove = (id: string) => {
    if (processor.isRunning) return;
    const removed = items.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.asset.url);
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? null);
    }
    processor.removeItem(id);
  };

  const handleActiveChange = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
  };

  const handleRegionChange = (nextRegion: NormalizedRegion) => {
    if (!activeItem || processingMode === "veo") return;
    setItems((current) => current.map((item) => (
      item.id === activeItem.id ? { ...item, region: nextRegion } : item
    )));
    processor.resetItem(activeItem.id);
  };

  const handleDownloadAll = async () => {
    if (downloadingAll) return;
    const results = items.flatMap((item) => {
      const result = processor.states[item.id]?.result;
      return result ? [{ name: result.outputName || cleanOutputName(item.asset.file.name), blob: result.blob }] : [];
    });
    if (results.length === 0) return;

    setError("");
    setDownloadingAll(true);
    try {
      const archive = await createResultArchive(results);
      downloadBlob(archive, `clearframe-${results.length}-videos.zip`);
    } catch (reason) {
      setError(reason instanceof Error ? `打包下载失败：${reason.message}` : "打包下载失败，请重试。");
    } finally {
      setDownloadingAll(false);
    }
  };

  const resetSidecarConnection = (message: string) => {
    setSidecarState("idle");
    setSidecarHealth(null);
    setSidecarMessage(message);
    setSidecarPairingCode("");
    setVeoCliStatus(null);
    setVeoSelectionError("");
  };

  const handleConnectSidecar = async () => {
    if (sidecarState === "checking") return;
    setSidecarState("checking");
    setSidecarPairingCode("");
    setSidecarMessage("正在检查本机安全会话…");
    try {
      const connection = { baseUrl: sidecarUrl };
      let health: SidecarHealth;
      try {
        health = await checkSidecar(connection);
      } catch {
        await pairSidecar(connection, (challenge) => {
          setSidecarPairingCode(challenge.code);
          setSidecarMessage(challenge.status === "pending"
            ? `请在系统弹窗核对并确认：${challenge.code.slice(0, 3)} ${challenge.code.slice(3)}`
            : "系统已确认，正在建立安全会话…");
        });
        health = await checkSidecar(connection);
      }
      if (!health.ready) throw new Error("sidecar 尚未就绪");
      const veoStatus = await getVeoCliStatus(connection);
      setSidecarHealth(health);
      setVeoCliStatus(veoStatus);
      setSidecarState("ready");
      setSidecarPairingCode("");
      setSidecarMessage(`已安全配对 ${health.capabilities.platform}/${health.capabilities.arch} · 码率容差 ±${Math.round(health.bitrateTolerance * 100)}%`);
    } catch (reason) {
      setSidecarHealth(null);
      setSidecarState("error");
      setSidecarPairingCode("");
      setSidecarMessage(reason instanceof Error ? reason.message : "无法连接本机 sidecar");
    }
  };

  const handleSelectVeoCli = async () => {
    if (!sidecarConnection || veoSelecting) return;
    setVeoSelecting(true);
    setVeoSelectionError("");
    try {
      const status = await selectVeoCli(sidecarConnection);
      setVeoCliStatus(status);
    } catch (reason) {
      setVeoSelectionError(reason instanceof Error ? reason.message : "无法打开本机 CLI 选择器");
    } finally {
      setVeoSelecting(false);
    }
  };

  const handleUseDelogo = () => {
    if (!window.confirm("确认离开 VEO 实验模式并改用 CLEARFRAME delogo？当前视频不会自动开始处理。")) return;
    setProcessingMode(sidecarState === "ready" ? "native" : "browser");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Clearframe 首页">
          <span className="brand__mark"><Sparkles size={17} /></span>
          <span>CLEARFRAME</span>
          <small>去印台</small>
        </a>
        <div className="topbar__status">
          <span><Activity size={14} /> {processingMode === "browser"
            ? "BROWSER READY"
            : processingMode === "veo" && sidecarState === "ready" && veoCliStatus?.selection?.valid
              ? "VEO VERIFIED"
              : sidecarState === "ready" ? "SIDECAR READY" : "SIDECAR OFFLINE"}</span>
          <span><LockKeyhole size={14} /> LOCAL ONLY</span>
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <div>
            <p className="eyebrow">VIDEO RESTORATION CONSOLE</p>
            <h1>免费去除视频水印，<br /><em>基于AI实现精准修改</em></h1>
          </div>
          <WorkflowNavigation itemCount={items.length} />
        </section>

        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {loading && <div className="notice" role="status">正在读取批量视频信息…</div>}

        {activeItem ? (
          <div className="workspace-stack">
            <BatchQueue
              items={items}
              states={processor.states}
              activeId={activeItem.id}
              disabled={loading || processor.isRunning}
              onAdd={handleSelect}
              onRemove={handleRemove}
              onSelect={handleActiveChange}
            />
            <ProcessPanel
              state={processState}
              total={items.length}
              completed={completed}
              remaining={remaining}
              downloadingAll={downloadingAll}
              mode={processingMode}
              sidecarUrl={sidecarUrl}
              sidecarPairingCode={sidecarPairingCode}
              sidecarState={sidecarState}
              sidecarMessage={sidecarMessage}
              sidecarHealth={sidecarHealth}
              onProcess={() => void processor.run(items)}
              onCancel={processor.cancel}
              onClearQueue={handleReset}
              onDownloadAll={() => void handleDownloadAll()}
              onModeChange={setProcessingMode}
              onSidecarUrlChange={(value) => {
                setSidecarUrl(value);
                resetSidecarConnection("地址已更改，请重新连接");
              }}
              onConnectSidecar={() => void handleConnectSidecar()}
              veoCliStatus={veoCliStatus}
              veoSelecting={veoSelecting}
              veoSelectionError={veoSelectionError}
              veoForceAllFrames={veoForceAllFrames}
              onVeoForceAllFramesChange={setVeoForceAllFrames}
              onSelectVeoCli={() => void handleSelectVeoCli()}
              onUseDelogo={handleUseDelogo}
            />
            <VideoPreview
              asset={activeItem.asset}
              region={activeItem.region}
              automaticDetection={processingMode === "veo"}
              onRegionChange={handleRegionChange}
            />
            <div id={WORKFLOW_SECTIONS.outputVideo.id} className="workflow-output-slot">
              {activeState?.result && (
                <ResultPanel
                  asset={activeItem.asset}
                  result={activeState.result}
                  autoScroll={items.length === 1}
                  onReprocess={() => {
                    processor.resetItem(activeItem.id);
                    document.getElementById("region-heading")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <UploadZone disabled={loading} onSelect={handleSelect} />
        )}
      </main>

      <footer>
        <span>所有媒体处理均留在当前设备</span>
        <span>仅处理你拥有权利或已获授权的视频</span>
      </footer>
    </div>
  );
}
