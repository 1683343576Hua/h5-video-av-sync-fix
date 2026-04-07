// ==UserScript==
// @name         音频延迟调节器 | 音画同步修复（毫秒级精度+智能检测）
// @name:en      Audio Delay Adjuster | A/V Sync Fix (ms Precision + Auto Detection)
// @namespace    https://github.com/1683343576Hua
// @version      4.1.1
// @description  专门解决H5视频音频比画面快的问题，支持0.001秒毫秒级精度调节，支持手都检测延迟，全网站兼容，支持iframe内嵌视频，自动记忆用户设置
// @description:en  Fix H5 video audio ahead of picture, support 0.001s millisecond precision adjustment, auto delay detection, full site compatible, iframe video support, auto save user settings
// @author       1683343576Hua
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @run-at       document-start
// @allFrames    true
// @homepageURL  https://github.com/1683343576Hua/h5-video-av-sync-fix
// @supportURL   https://github.com/1683343576Hua/h5-video-av-sync-fix/issues
// @updateURL    https://github.com/1683343576Hua/h5-video-av-sync-fix/raw/refs/heads/main/h5-video-av-sync-fix.user.js
// @downloadURL  https://github.com/1683343576Hua/h5-video-av-sync-fix/raw/refs/heads/main/h5-video-av-sync-fix.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ========== 核心配置 ==========
    const MAX_DELAY = 10; // 最大延迟10秒，可自行修改
    const STEP_FINE = 0.001; // 微调步长：1毫秒
    const STEP_MID = 0.01; // 中调步长：10毫秒
    const STEP_COARSE = 0.1; // 粗调步长：100毫秒
    const DEFAULT_DELAY = GM_getValue('audio_delay_sec', 0);

    // ========== 全局状态 ==========
    let audioCtx = null;
    let globalDelayNode = null;
    let hookedVideos = new Map();
    let currentDelay = DEFAULT_DELAY;
    let isPanelCollapsed = false;
    
    // 检测延迟相关状态
    let detectionState = 'idle'; // idle, waiting_sound, waiting_video
    let soundTime = 0;
    let videoTime = 0;

    // ========== 1. 样式注入 ==========
    GM_addStyle(`
        #audio-delay-master-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(15, 15, 15, 0.95);
            color: #ffffff;
            padding: 18px;
            border-radius: 12px;
            z-index: 2147483647;
            font-family: system-ui, -apple-system, sans-serif;
            box-shadow: 0 4px 25px rgba(0, 0, 0, 0.7);
            width: 260px;
            transition: all 0.2s ease;
            user-select: none;
        }
        #audio-delay-master-panel.collapsed {
            width: 70px;
            height: 45px;
            padding: 10px;
            overflow: hidden;
        }
        #audio-delay-master-panel .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
            cursor: move;
        }
        #audio-delay-master-panel .panel-title {
            font-size: 15px;
            font-weight: 600;
            white-space: nowrap;
        }
        #audio-delay-master-panel .panel-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        #audio-delay-master-panel .action-btn {
            cursor: pointer;
            color: #aaaaaa;
            font-size: 18px;
            line-height: 1;
            transition: color 0.2s;
        }
        #audio-delay-master-panel .action-btn:hover {
            color: #ffffff;
        }
        #audio-delay-master-panel .delay-display {
            text-align: center;
            font-size: 36px;
            font-weight: 700;
            color: #00ccff;
            margin: 12px 0;
            letter-spacing: 1px;
            font-variant-numeric: tabular-nums;
        }
        #audio-delay-master-panel .delay-slider {
            width: 100%;
            margin: 10px 0;
            height: 6px;
            border-radius: 3px;
            background: #333333;
            outline: none;
            -webkit-appearance: none;
        }
        #audio-delay-master-panel .delay-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #00ccff;
            cursor: pointer;
            transition: all 0.2s;
        }
        #audio-delay-master-panel .delay-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
            background: #00eeff;
        }
        #audio-delay-master-panel .btn-group {
            display: flex;
            gap: 6px;
            margin: 10px 0;
        }
        #audio-delay-master-panel .control-btn {
            flex: 1;
            background: #2a2a2a;
            border: 1px solid #444444;
            color: #ffffff;
            padding: 8px 0;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
            font-weight: 500;
        }
        #audio-delay-master-panel .control-btn:hover {
            background: #404040;
        }
        #audio-delay-master-panel .control-btn.primary {
            background: #0066cc;
            border-color: #0088ff;
        }
        #audio-delay-master-panel .control-btn.danger {
            background: #aa2200;
            border-color: #ff4400;
        }
        #audio-delay-master-panel .control-btn.success {
            background: #00aa44;
            border-color: #00cc55;
        }
        #audio-delay-master-panel .status-tip {
            font-size: 11px;
            color: #888888;
            text-align: center;
            margin-top: 10px;
            line-height: 1.5;
        }
        #audio-delay-master-panel .detection-tip {
            font-size: 12px;
            color: #ffcc00;
            text-align: center;
            margin: 10px 0;
            padding: 8px;
            background: rgba(255, 204, 0, 0.1);
            border-radius: 6px;
            border: 1px solid rgba(255, 204, 0, 0.3);
            min-height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #audio-delay-master-panel .collapsed-tip {
            display: none;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            color: #00ccff;
            line-height: 25px;
        }
        #audio-delay-master-panel.collapsed .panel-content,
        #audio-delay-master-panel.collapsed .panel-title {
            display: none;
        }
        #audio-delay-master-panel.collapsed .collapsed-tip {
            display: block;
        }
    `);

    // ========== 2. 音频引擎核心初始化 ==========
    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            globalDelayNode = audioCtx.createDelay(MAX_DELAY);
            globalDelayNode.delayTime.value = currentDelay;
            globalDelayNode.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return { audioCtx, globalDelayNode };
    }

    // ========== 3. 视频Hook核心逻辑 ==========
    function hookVideo(videoElement) {
        if (hookedVideos.has(videoElement)) return;

        if (!videoElement.crossOrigin) {
            videoElement.crossOrigin = 'anonymous';
        }

        const onVideoPlay = async () => {
            try {
                const { audioCtx, globalDelayNode } = initAudioContext();
                if (hookedVideos.has(videoElement)) return;

                const sourceNode = audioCtx.createMediaElementSource(videoElement);
                sourceNode.connect(globalDelayNode);

                hookedVideos.set(videoElement, {
                    source: sourceNode,
                    playListener: onVideoPlay
                });

                updateStatusTip(`已连接 ${hookedVideos.size} 个视频`);
            } catch (error) {
                console.warn('音频延迟Hook失败:', error);
                updateStatusTip('视频连接失败，尝试刷新页面重试');
            }
        };

        videoElement.addEventListener('play', onVideoPlay, { once: false });
        videoElement.addEventListener('ended', () => unhookVideo(videoElement));
        videoElement.addEventListener('remove', () => unhookVideo(videoElement));
    }

    function unhookVideo(videoElement) {
        const data = hookedVideos.get(videoElement);
        if (data) {
            data.source.disconnect();
            videoElement.removeEventListener('play', data.playListener);
            hookedVideos.delete(videoElement);
        }
    }

    // ========== 4. 延迟更新核心函数 ==========
    function updateDelay(newDelay) {
        newDelay = Math.max(0, Math.min(MAX_DELAY, newDelay));
        currentDelay = newDelay;

        document.getElementById('delay-value-display').textContent = `${currentDelay.toFixed(3)}s`;
        document.getElementById('delay-slider').value = currentDelay;

        if (globalDelayNode) {
            globalDelayNode.delayTime.value = currentDelay;
        }

        GM_setValue('audio_delay_sec', currentDelay);
        initAudioContext();
    }

    // ========== 5. 智能检测延迟功能 ==========
    function startDetection() {
        detectionState = 'waiting_sound';
        soundTime = 0;
        videoTime = 0;
        updateDetectionTip('请播放视频，找到一个明显的同步点（如拍手、枪响）<br>当<strong>听到声音</strong>时，点击下方「标记声音」');
        document.getElementById('btn-detect-sound').style.display = 'block';
        document.getElementById('btn-detect-video').style.display = 'none';
        document.getElementById('btn-detect-apply').style.display = 'none';
        document.getElementById('btn-detect-start').style.display = 'none';
    }

    function markSound() {
        soundTime = performance.now();
        detectionState = 'waiting_video';
        updateDetectionTip('好的！现在当你<strong>看到对应画面动作</strong>时，点击「标记画面」');
        document.getElementById('btn-detect-sound').style.display = 'none';
        document.getElementById('btn-detect-video').style.display = 'block';
    }

    function markVideo() {
        videoTime = performance.now();
        detectionState = 'idle';
        
        // 计算延迟：画面时间 - 声音时间 = 需要的音频延迟
        const calculatedDelay = (videoTime - soundTime) / 1000;
        
        if (calculatedDelay > 0) {
            updateDetectionTip(`检测完成！<br>计算出的延迟值：<strong style="color: #00eeff; font-size: 16px;">${calculatedDelay.toFixed(3)}秒</strong><br>点击「应用延迟」使用此值`);
            document.getElementById('btn-detect-video').style.display = 'none';
            document.getElementById('btn-detect-apply').style.display = 'block';
            document.getElementById('btn-detect-apply').dataset.delay = calculatedDelay;
        } else {
            updateDetectionTip(`检测结果异常（延迟值为负）<br>请确保先听到声音，再看到画面<br>点击「重新检测」再试一次`);
            document.getElementById('btn-detect-video').style.display = 'none';
            document.getElementById('btn-detect-start').textContent = '重新检测';
            document.getElementById('btn-detect-start').style.display = 'block';
        }
    }

    function applyCalculatedDelay() {
        const delay = parseFloat(document.getElementById('btn-detect-apply').dataset.delay);
        updateDelay(delay);
        updateDetectionTip('延迟已应用！你可以继续微调以获得最佳效果');
        document.getElementById('btn-detect-apply').style.display = 'none';
        document.getElementById('btn-detect-start').textContent = '重新检测';
        document.getElementById('btn-detect-start').style.display = 'block';
    }

    function updateDetectionTip(html) {
        const tipEl = document.getElementById('detection-tip');
        if (tipEl) tipEl.innerHTML = html;
    }

    // ========== 6. UI构建与交互 ==========
    function buildPanel() {
        if (document.getElementById('audio-delay-master-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'audio-delay-master-panel';
        panel.innerHTML = `
            <div class="collapsed-tip">延迟</div>
            <div class="panel-header">
                <span class="panel-title">音频延迟调节器</span>
                <div class="panel-actions">
                    <span class="action-btn" id="collapse-btn" title="折叠/展开">—</span>
                    <span class="action-btn" id="close-btn" title="关闭">×</span>
                </div>
            </div>
            <div class="panel-content">
                <div class="delay-display" id="delay-value-display">${currentDelay.toFixed(3)}s</div>
                <input 
                    type="range" 
                    id="delay-slider" 
                    class="delay-slider" 
                    min="0" 
                    max="${MAX_DELAY}" 
                    step="${STEP_FINE}" 
                    value="${currentDelay}"
                >
                
                <!-- 三档调节按钮 -->
                <div class="btn-group">
                    <button class="control-btn" id="btn-minus-coarse">-0.1s</button>
                    <button class="control-btn" id="btn-minus-mid">-0.01s</button>
                    <button class="control-btn" id="btn-minus-fine">-0.001s</button>
                </div>
                <div class="btn-group">
                    <button class="control-btn" id="btn-plus-fine">+0.001s</button>
                    <button class="control-btn" id="btn-plus-mid">+0.01s</button>
                    <button class="control-btn" id="btn-plus-coarse">+0.1s</button>
                </div>
                <div class="btn-group">
                    <button class="control-btn danger" id="btn-reset">重置为0</button>
                    <button class="control-btn primary" id="btn-test">播放测试音</button>
                </div>
                
                <!-- 智能检测区域 -->
                <div class="detection-tip" id="detection-tip">
                    点击下方「开始检测」，自动计算精确延迟值
                </div>
                <div class="btn-group">
                    <button class="control-btn success" id="btn-detect-start">开始检测</button>
                    <button class="control-btn" id="btn-detect-sound" style="display: none;">标记声音</button>
                    <button class="control-btn" id="btn-detect-video" style="display: none;">标记画面</button>
                    <button class="control-btn success" id="btn-detect-apply" style="display: none;">应用延迟</button>
                </div>
                
                <div class="status-tip" id="status-tip">等待视频播放...</div>
                <div class="status-tip">
                    快捷键：← 减0.001s | → 加0.001s | 空格 重置
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        bindPanelEvents(panel);
        makePanelDraggable(panel);
    }

    function bindPanelEvents(panel) {
        // 滑块调节
        const slider = document.getElementById('delay-slider');
        slider.addEventListener('input', (e) => {
            updateDelay(parseFloat(e.target.value));
        });

        // 三档调节按钮
        document.getElementById('btn-minus-coarse').addEventListener('click', () => updateDelay(currentDelay - STEP_COARSE));
        document.getElementById('btn-minus-mid').addEventListener('click', () => updateDelay(currentDelay - STEP_MID));
        document.getElementById('btn-minus-fine').addEventListener('click', () => updateDelay(currentDelay - STEP_FINE));
        document.getElementById('btn-plus-fine').addEventListener('click', () => updateDelay(currentDelay + STEP_FINE));
        document.getElementById('btn-plus-mid').addEventListener('click', () => updateDelay(currentDelay + STEP_MID));
        document.getElementById('btn-plus-coarse').addEventListener('click', () => updateDelay(currentDelay + STEP_COARSE));

        // 重置和测试
        document.getElementById('btn-reset').addEventListener('click', () => updateDelay(0));
        document.getElementById('btn-test').addEventListener('click', playTestSound);

        // 智能检测按钮
        document.getElementById('btn-detect-start').addEventListener('click', startDetection);
        document.getElementById('btn-detect-sound').addEventListener('click', markSound);
        document.getElementById('btn-detect-video').addEventListener('click', markVideo);
        document.getElementById('btn-detect-apply').addEventListener('click', applyCalculatedDelay);

        // 折叠/展开
        document.getElementById('collapse-btn').addEventListener('click', () => {
            isPanelCollapsed = !isPanelCollapsed;
            panel.classList.toggle('collapsed', isPanelCollapsed);
            document.getElementById('collapse-btn').textContent = isPanelCollapsed ? '□' : '—';
        });

        // 关闭面板
        document.getElementById('close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // 键盘快捷键（微调精度）
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    updateDelay(currentDelay - STEP_FINE);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    updateDelay(currentDelay + STEP_FINE);
                    break;
                case ' ':
                    e.preventDefault();
                    updateDelay(0);
                    break;
            }
        });
    }

    function makePanelDraggable(panel) {
        const header = panel.querySelector('.panel-header');
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            panel.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;
            panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.cursor = 'default';
        });
    }

    function playTestSound() {
        const { audioCtx } = initAudioContext();
        if (!audioCtx) return;

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(globalDelayNode);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    }

    function updateStatusTip(text) {
        const tipEl = document.getElementById('status-tip');
        if (tipEl) tipEl.textContent = text;
    }

    // ========== 7. 全局监听 ==========
    function observeVideos() {
        document.querySelectorAll('video').forEach(hookVideo);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'VIDEO') {
                        hookVideo(node);
                    }
                    node.querySelectorAll('video').forEach(hookVideo);
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ========== 8. 初始化执行 ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            buildPanel();
            observeVideos();
        });
    } else {
        buildPanel();
        observeVideos();
    }

    window.addEventListener('beforeunload', () => {
        hookedVideos.forEach((data) => data.source.disconnect());
        if (audioCtx) audioCtx.close();
    });

})();
