class ColorExtractor {
    constructor() {
        this.imageData = null;
        this.colorData = null;
        this.groupedData = null;
        this.totalPixels = 0;
        this.transparentCount = 0;
        this.originalColorCount = 0;
        this.isProcessing = false;
        this.shouldStop = false;

        this.worker = null;

        this.initElements();
        this.bindEvents();
        this.initWorker();

        this.updateToleranceItemState(12);
    }

    initWorker() {
        try {
            if (window.Worker) {
                this.worker = new Worker('color-worker.js');
                this.worker.onmessage = (e) => this.handleWorkerMessage(e);
                this.worker.onerror = (e) => {
                    console.error('Worker错误:', e.message, e.filename, e.lineno);
                    alert(`处理失败: ${e.message}\n\n提示：如果是在本地打开文件(file://)，请使用本地服务器运行`);
                    this.finishProcessing();
                };
                console.log('✅ Web Worker 初始化成功');
            } else {
                throw new Error('浏览器不支持 Web Worker');
            }
        } catch (error) {
            console.error('Worker初始化失败:', error);
            alert(`⚠️ Web Worker 初始化失败: ${error.message}`);
        }
    }

    handleWorkerMessage(e) {
        const { type, stage, progress, data, message } = e.data;

        switch (type) {
            case 'progress':
                if (stage === 1) {
                    this.updateStage1Progress(progress);
                } else if (stage === 2) {
                    this.updateStage2Progress();
                }
                break;

            case 'complete':
                if (stage === 1) {
                    this.colorData = data.colorData;
                    this.totalPixels = data.totalPixels;
                    this.transparentCount = data.transparentCount;
                    this.originalColorCount = data.originalColorCount;
                    this.completeStage1();

                    const tolerance = parseInt(this.toleranceSlider.value);
                    if (tolerance > 0 && Object.keys(this.colorData).length > 10) {
                        setTimeout(() => {
                            this.worker.postMessage({
                                type: 'group',
                                data: {
                                    colorData: this.colorData,
                                    tolerance
                                }
                            });
                        }, 100);
                    } else {
                        this.groupedData = null;
                        this.completeStage2();
                        this.finishExtraction();
                    }
                } else if (stage === 2) {
                    this.groupedData = data.groupedData;
                    this.completeStage2();
                    this.finishExtraction();
                }
                break;

            case 'error':
                if (message === '用户中止') {
                    this.progressText.textContent = '⏹ 已停止处理';
                    this.stage1Bar.style.width = '0%';
                    this.stage2Bar.style.width = '0%';
                    this.stage2Bar.style.animation = 'none';
                    this.stage2Bar.classList.remove('completed-bar');
                    this.stage1.className = 'stage stage-1';
                    this.stage2.className = 'stage stage-2';
                } else {
                    alert(`提取失败: ${message}`);
                    this.progressSection.hidden = true;
                }
                this.finishProcessing();
                break;
        }
    }

    initElements() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.fileInfo = document.getElementById('fileInfo');
        this.previewImage = document.getElementById('previewImage');
        this.uploadContent = document.getElementById('uploadContent');
        this.changeImageBtn = document.getElementById('changeImageBtn');
        this.toleranceSlider = document.getElementById('toleranceSlider');
        this.toleranceLabel = document.getElementById('toleranceLabel');
        this.toleranceItem = document.getElementById('toleranceItem');
        this.toggleAnimation = document.getElementById('toggleAnimation');
        this.animationItem = document.getElementById('animationItem');
        this.actionItem = document.getElementById('actionItem');
        this.extractBtn = document.getElementById('extractBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.progressSection = document.getElementById('progressSection');
        this.stage1Bar = document.getElementById('stage1Bar');
        this.stage2Bar = document.getElementById('stage2Bar');
        this.progressText = document.getElementById('progressText');
        this.stage1 = document.querySelector('.stage-1');
        this.stage2 = document.querySelector('.stage-2');
        this.statsSection = document.getElementById('statsSection');
        this.totalPixelsEl = document.getElementById('totalPixels');
        this.originalColorsEl = document.getElementById('originalColors');
        this.groupedColorsEl = document.getElementById('groupedColors');
        this.elapsedTimeEl = document.getElementById('elapsedTime');
        this.resultsSection = document.getElementById('resultsSection');
        this.colorGrid = document.getElementById('colorGrid');
        this.exportFormat = document.getElementById('exportFormat');
        this.exportBtn = document.getElementById('exportBtn');

        this.animationEnabled = true;
    }

    bindEvents() {
        this.dropZone.addEventListener('click', (e) => {
            if (!this.changeImageBtn.contains(e.target)) {
                this.fileInput.click();
            }
        });
        this.changeImageBtn.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.toleranceSlider.addEventListener('input', (e) => this.updateToleranceLabel(e));
        this.toggleAnimation.addEventListener('click', () => this.toggleAnimationEffect());
        this.extractBtn.addEventListener('click', () => this.startExtraction());
        this.stopBtn.addEventListener('click', () => this.stopProcessing());
        this.exportBtn.addEventListener('click', () => this.exportResults());
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    processFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件！');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.showPreview(img, file);
                this.loadImageData(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    showPreview(img, file) {
        this.previewImage.src = img.src;
        this.previewImage.style.display = 'block';
        this.previewImage.hidden = false;
        this.uploadContent.style.display = 'none';
        this.changeImageBtn.hidden = false;
        this.dropZone.classList.add('has-image');

        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const sizeGB = (file.size / (1024 ** 3)).toFixed(2);
        const displaySize = file.size > 1024 * 1024 * 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;

        this.fileInfo.innerHTML = `
            <strong>文件名:</strong> ${file.name}<br>
            <strong>尺寸:</strong> ${img.width} x ${img.height} (${(img.width * img.height).toLocaleString()} 像素)<br>
            <strong>大小:</strong> ${displaySize}
        `;
        this.fileInfo.classList.add('show');
    }

    loadImageData(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    updateToleranceLabel(e) {
        const value = parseInt(e.target.value);
        const toleranceLevels = [0, 12, 25, 38, 50];
        const displayNames = {
            0: '完全(0)',
            12: '细致(12)',
            25: '中等(25)',
            38: '粗糙(38)',
            50: '最少(50)'
        };

        let closest = toleranceLevels.reduce((prev, curr) =>
            Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
        );
        this.toleranceSlider.value = closest;
        this.toleranceLabel.textContent = displayNames[closest];

        this.updateToleranceItemState(closest);
    }

    updateToleranceItemState(value) {
        this.toleranceItem.removeAttribute('data-tolerance');

        if (value <= 12) {
            this.toleranceItem.setAttribute('data-tolerance', 'low');
        } else if (value <= 25) {
            this.toleranceItem.setAttribute('data-tolerance', 'medium');
        } else {
            this.toleranceItem.setAttribute('data-tolerance', 'high');
        }
    }

    toggleAnimationEffect() {
        this.animationEnabled = !this.animationEnabled;

        if (this.animationEnabled) {
            this.toggleAnimation.textContent = '开启';
            this.toggleAnimation.classList.add('active');
            this.animationItem.classList.remove('animation-off');
            this.animationItem.classList.add('animation-on');
        } else {
            this.toggleAnimation.textContent = '关闭';
            this.toggleAnimation.classList.remove('active');
            this.animationItem.classList.remove('animation-on');
            this.animationItem.classList.add('animation-off');
        }
    }

    async startExtraction() {
        if (!this.imageData) {
            alert('请先选择图片文件！');
            return;
        }

        if (this.isProcessing || !this.worker) return;

        this.isProcessing = true;
        this.shouldStop = false;

        this.extractBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.actionItem.classList.add('processing');
        this.progressSection.hidden = false;
        this.resultsSection.hidden = true;
        this.statsSection.hidden = true;

        this.initProgressStages();

        this.startTime = performance.now();

        this.worker.postMessage({
            type: 'extract',
            data: {
                imageData: this.imageData,
                minDuration: 2000
            }
        });
    }

    finishExtraction() {
        const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(2);

        setTimeout(() => {
            this.displayResults(elapsed);
            this.finishProcessing();
        }, 300);
    }

    finishProcessing() {
        this.isProcessing = false;
        this.extractBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.actionItem.classList.remove('processing');
    }

    stopProcessing() {
        this.shouldStop = true;
        this.progressText.textContent = '正在停止处理...';

        if (this.worker) {
            this.worker.postMessage({ type: 'stop' });
        }
    }

    initProgressStages() {
        this.stage1Bar.style.width = '0%';
        this.stage2Bar.style.width = '0%';
        this.stage2Bar.style.animation = '';
        this.stage2Bar.classList.remove('completed-bar');
        this.stage1.className = 'stage stage-1 active';
        this.stage2.className = 'stage stage-2';
        this.progressText.textContent = '准备开始...';
    }

    updateStage1Progress(progress) {
        this.stage1Bar.style.width = `${progress}%`;
        this.progressText.textContent = `① 提取颜色中... ${progress}%`;
    }

    updateStage2Progress() {
        this.stage2Bar.style.width = '100%';
        this.progressText.textContent = '② 正在分组分类中，请稍候...';
    }

    completeStage1() {
        this.stage1Bar.style.width = '100%';
        this.stage1.classList.remove('active');
        this.stage1.classList.add('completed');
        this.stage2.classList.add('active');
        this.updateStage2Progress();
    }

    completeStage2() {
        this.stage2Bar.style.width = '100%';
        this.stage2Bar.style.animation = 'none';
        this.stage2Bar.classList.add('completed-bar');
        this.stage2.classList.remove('active');
        this.stage2.classList.add('completed');
        this.progressText.textContent = '✓ 处理完成！';
    }

    displayResults(elapsed) {
        this.progressSection.hidden = true;
        this.statsSection.hidden = false;
        this.resultsSection.hidden = false;

        this.totalPixelsEl.textContent = this.totalPixels.toLocaleString();
        this.originalColorsEl.textContent = this.originalColorCount.toLocaleString();
        this.groupedColorsEl.textContent = this.groupedData
            ? Object.keys(this.groupedData).length.toLocaleString()
            : '-';
        this.elapsedTimeEl.textContent = `${elapsed}s`;

        this.renderColorCards();
    }

    renderColorCards() {
        this.colorGrid.innerHTML = '';

        let sortedData;
        if (this.groupedData) {
            sortedData = Object.entries(this.groupedData)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 200);
        } else {
            sortedData = Object.entries(this.colorData)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 200);
        }

        const totalColors = sortedData.length;
        const cols = Math.floor(this.colorGrid.offsetWidth / 52);

        sortedData.forEach(([color, info], index) => {
            const count = info.count || info;
            const percentage = ((count / this.totalPixels) * 100).toFixed(2);
            const mergedCount = info.colorCount || 1;

            const swatch = document.createElement('div');
            swatch.className = 'color-swatch placeholder';
            swatch.dataset.swatchColor = color;
            swatch.dataset.index = index;
            swatch.dataset.totalColors = totalColors;
            swatch.dataset.cols = cols;
            swatch.dataset.count = count;
            swatch.dataset.percentage = percentage;
            swatch.dataset.mergedCount = mergedCount;

            let tooltipContent = `
                <div class="tooltip">
                    <div class="tooltip-color">${color.toUpperCase()}</div>
                    <div class="tooltip-stats">
                        <div class="tooltip-stat">
                            <span>出现次数</span>
                            <span class="tooltip-value">${count.toLocaleString()}</span>
                        </div>
                        <div class="tooltip-stat">
                            <span>占比</span>
                            <span class="tooltip-value">${percentage}%</span>
                        </div>
            `;

            if (this.groupedData) {
                tooltipContent += `
                        <div class="tooltip-stat">
                            <span>合并颜色数</span>
                            <span class="tooltip-value">${mergedCount}</span>
                        </div>
                `;
            }

            tooltipContent += `
                    </div>
                </div>
            `;

            swatch.innerHTML = tooltipContent;
            this.colorGrid.appendChild(swatch);
        });

        if ((this.groupedData ? Object.keys(this.groupedData).length : Object.keys(this.colorData).length) > 200) {
            const moreSwatch = document.createElement('div');
            moreSwatch.className = 'color-swatch placeholder visible no-animate';
            moreSwatch.style.background = 'linear-gradient(135deg, #f0f0f0 25%, #e0e0e0 25%, #e0e0e0 50%, #f0f0f0 50%, #f0f0f0 75%, #e0e0e0 75%, #e0e0e0 100%)';
            moreSwatch.style.backgroundSize = '20px 20px';
            moreSwatch.style.display = 'flex';
            moreSwatch.style.alignItems = 'center';
            moreSwatch.style.justifyContent = 'center';
            moreSwatch.innerHTML = `<span style="color: #666; font-size: 12px; font-weight: 500;">+${(this.groupedData ? Object.keys(this.groupedData).length : Object.keys(this.colorData).length) - 200}</span>`;
            this.colorGrid.appendChild(moreSwatch);
        }

        this.setupLazyLoadObserver();
    }

    setupLazyLoadObserver() {
        const observerOptions = {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const swatch = entry.target;
                    if (swatch.classList.contains('placeholder')) {
                        this.animateSwatch(swatch);
                        observer.unobserve(swatch);
                    }
                }
            });
        }, observerOptions);

        document.querySelectorAll('.color-swatch.placeholder').forEach(swatch => {
            observer.observe(swatch);
        });
    }

    animateSwatch(swatch) {
        const color = swatch.dataset.swatchColor;
        const index = parseInt(swatch.dataset.index);
        const totalColors = parseInt(swatch.dataset.totalColors);
        const cols = parseInt(swatch.dataset.cols);

        swatch.classList.remove('placeholder');
        swatch.style.setProperty('--swatch-color', color);
        swatch.classList.add('visible');

        if (this.animationEnabled) {
            swatch.classList.add('animate');

            const row = Math.floor(index / cols);
            const col = index % cols;
            const centerRow = (totalColors / cols) / 2;
            const centerCol = cols / 2;
            const distance = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
            const maxDistance = Math.sqrt(Math.pow(centerRow, 2) + Math.pow(centerCol, 2));
            const delay = (distance / maxDistance) * 0.8;

            swatch.style.animationDelay = `${delay}s`;
        } else {
            swatch.classList.add('no-animate');
        }
    }

    exportResults() {
        if (!this.colorData) {
            alert('请先提取颜色数据！');
            return;
        }

        const format = this.exportFormat.value;
        let content = '';
        let filename = '';
        let mimeType = '';

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');

        if (format === 'json') {
            const results = [];
            let dataSource = this.groupedData
                ? Object.entries(this.groupedData).sort((a, b) => b[1].count - a[1].count)
                : Object.entries(this.colorData).sort((a, b) => b[1] - a[1]);

            dataSource.forEach(([color, info]) => {
                results.push({
                    color: color.toUpperCase(),
                    count: info.count || info,
                    percentage: (((info.count || info) / this.totalPixels) * 100).toFixed(2),
                    ...(this.groupedData && {
                        merged_colors: info.colors.map(c => c.toUpperCase()),
                        color_count: info.colorCount
                    })
                });
            });

            content = JSON.stringify({
                export_time: new Date().toISOString(),
                image_info: {
                    total_pixels: this.totalPixels,
                    original_colors: this.originalColorCount,
                    grouped_colors: this.groupedData ? Object.keys(this.groupedData).length : null,
                    transparent_pixels: this.transparentCount
                },
                settings: {
                    tolerance: parseInt(this.toleranceSlider.value),
                    tolerance_name: this.toleranceLabel.textContent
                },
                merged_colors: results
            }, null, 2);

            filename = `colors_${timestamp}.json`;
            mimeType = 'application/json';

        } else if (format === 'csv') {
            const lines = [];

            lines.push(`统计像素数,${this.totalPixels}`);
            if (this.transparentCount > 0) {
                lines.push(`透明像素数(已丢弃),${this.transparentCount}`);
            }

            if (this.groupedData) {
                lines.push('颜色(十六进制),数量,百分比(%),合并颜色数');
                const sortedGroups = Object.entries(this.groupedData)
                    .sort((a, b) => b[1].count - a[1].count);
                for (const [color, info] of sortedGroups) {
                    const count = info.count;
                    const percentage = ((count / this.totalPixels) * 100).toFixed(4);
                    lines.push(`${color},${count},${percentage},${info.colorCount}`);
                }
            } else {
                lines.push('颜色(十六进制),数量,百分比(%)');
                const sortedColors = Object.entries(this.colorData)
                    .sort((a, b) => b[1] - a[1]);
                for (const [color, count] of sortedColors) {
                    const percentage = ((count / this.totalPixels) * 100).toFixed(4);
                    lines.push(`${color},${count},${percentage}`);
                }
            }

            content = '\uFEFF' + lines.join('\n');
            filename = `colors_${timestamp}.csv`;
            mimeType = 'text/csv;charset=utf-8';

        } else if (format === 'txt') {
            const lines = [];

            lines.push(`统计像素数: ${this.totalPixels.toLocaleString()}`);
            if (this.transparentCount > 0) {
                lines.push(`透明像素数: ${this.transparentCount.toLocaleString()}（已丢弃）`);
            }
            lines.push(`原始颜色数量: ${this.originalColorCount.toLocaleString()}`);

            if (this.groupedData) {
                const groupedCount = Object.keys(this.groupedData).length;
                lines.push(`分组后颜色组数: ${groupedCount.toLocaleString()}`);
                lines.push(`相似度容差: ${this.toleranceLabel.textContent}`);
                lines.push('');
                lines.push('【颜色分组结果 - 代表色】');
                lines.push('');

                const sortedGroups = Object.entries(this.groupedData)
                    .sort((a, b) => b[1].count - a[1].count);
                let idx = 1;
                for (const [color, info] of sortedGroups) {
                    const count = info.count;
                    const percentage = ((count / this.totalPixels) * 100).toFixed(2);
                    lines.push(`${idx}  ${color}  数量: ${count.toLocaleString()}  占比: ${percentage}%  合并颜色数: ${info.colorCount}`);
                    idx++;
                }
            } else {
                lines.push('');
                lines.push('【颜色列表】');
                lines.push('');

                const sortedColors = Object.entries(this.colorData)
                    .sort((a, b) => b[1] - a[1]);
                let idx = 1;
                for (const [color, count] of sortedColors) {
                    const percentage = ((count / this.totalPixels) * 100).toFixed(2);
                    lines.push(`${idx}  ${color}  数量: ${count.toLocaleString()}  占比: ${percentage}%`);
                    idx++;
                }
            }

            content = '\uFEFF' + lines.join('\n');
            filename = `colors_${timestamp}.txt`;
            mimeType = 'text/plain;charset=utf-8';

        } else if (format === 'css') {
            content = `/* 颜色调色板 */\n/* 导出时间: ${new Date().toLocaleString()} */\n\n`;
            content += `:root {\n`;

            let dataSource = this.groupedData
                ? Object.entries(this.groupedData).sort((a, b) => b[1].count - a[1].count)
                : Object.entries(this.colorData).sort((a, b) => b[1] - a[1]);

            dataSource.forEach(([color, info], idx) => {
                const varName = `--color-${idx + 1}`;
                content += `  ${varName}: ${color}; /* ${(info.count || info).toLocaleString()}px */\n`;
            });

            content += `}\n`;
            filename = `colors_${timestamp}.css`;
            mimeType = 'text/css';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.colorExtractor = new ColorExtractor();
});