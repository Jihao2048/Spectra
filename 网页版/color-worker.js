class ColorWorker {
    constructor() {
        self.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(e) {
        const { type, data } = e.data;

        switch (type) {
            case 'extract':
                this.extractColors(data);
                break;
            case 'group':
                this.groupColors(data);
                break;
            case 'stop':
                this.shouldStop = true;
                break;
        }
    }

    extractColors({ imageData, minDuration }) {
        this.shouldStop = false;
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const colorData = {};
        let totalPixels = 0;
        let transparentCount = 0;

        const chunkSize = Math.ceil(height / 100);
        const startTime = performance.now();

        for (let y = 0; y < height; y++) {
            if (this.shouldStop) {
                self.postMessage({
                    type: 'error',
                    message: '用户中止'
                });
                return;
            }

            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];

                if (a === 0) {
                    transparentCount++;
                    continue;
                }

                totalPixels++;
                const hexColor = '#' + [r, g, b].map(x =>
                    x.toString(16).padStart(2, '0')
                ).join('');

                colorData[hexColor] = (colorData[hexColor] || 0) + 1;
            }

            if (y % chunkSize === 0) {
                const actualProgress = (y / height);
                const elapsed = performance.now() - startTime;
                const expectedProgress = elapsed / minDuration;
                const displayProgress = Math.round(Math.min(actualProgress, expectedProgress) * 100);

                self.postMessage({
                    type: 'progress',
                    stage: 1,
                    progress: displayProgress
                });
            }
        }

        const finalElapsed = performance.now() - startTime;
        if (finalElapsed < minDuration) {
            const remainingTime = minDuration - finalElapsed;
            const steps = 20;
            const stepDelay = remainingTime / steps;

            for (let i = 1; i <= steps; i++) {
                if (this.shouldStop) {
                    self.postMessage({
                        type: 'error',
                        message: '用户中止'
                    });
                    return;
                }

                self.postMessage({
                    type: 'progress',
                    stage: 1,
                    progress: Math.min(100, 95 + i)
                });

                const waitStart = Date.now();
                while (Date.now() - waitStart < stepDelay) {
                    // 简单的忙等待，兼容性好
                }
            }
        }

        self.postMessage({
            type: 'complete',
            stage: 1,
            data: {
                colorData,
                totalPixels,
                transparentCount,
                originalColorCount: Object.keys(colorData).length
            }
        });
    }

    groupColors({ colorData, tolerance }) {
        this.shouldStop = false;

        const colors = Object.entries(colorData)
            .map(([color, count]) => ({
                rgb: this.hexToRgb(color),
                color,
                count
            }))
            .sort((a, b) => b.count - a.count);

        const groups = [];
        const processed = new Set();

        for (let i = 0; i < colors.length; i++) {
            if (this.shouldStop) {
                self.postMessage({
                    type: 'error',
                    message: '用户中止'
                });
                return;
            }

            const { rgb, color, count } = colors[i];
            if (processed.has(color)) continue;

            const group = {
                representative: color,
                colors: [color],
                count,
                colorCount: 1
            };
            processed.add(color);

            for (let j = i + 1; j < colors.length; j++) {
                const { rgb: rgb2, color: color2, count: count2 } = colors[j];
                if (processed.has(color2)) continue;

                const dist = this.colorDistance(rgb, rgb2);
                if (dist <= tolerance) {
                    group.colors.push(color2);
                    group.count += count2;
                    group.colorCount++;
                    processed.add(color2);
                }
            }

            groups.push(group);

            if (i % 10 === 0) {
                self.postMessage({
                    type: 'progress',
                    stage: 2
                });
            }
        }

        const groupedData = {};
        for (const group of groups) {
            groupedData[group.representative] = {
                count: group.count,
                colors: group.colors,
                colorCount: group.colorCount
            };
        }

        self.postMessage({
            type: 'complete',
            stage: 2,
            data: { groupedData }
        });
    }

    hexToRgb(hex) {
        hex = hex.replace('#', '');
        return [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16)
        ];
    }

    colorDistance(c1, c2) {
        return Math.sqrt(
            c1.reduce((sum, val, idx) => sum + Math.pow(val - c2[idx], 2), 0)
        );
    }
}

new ColorWorker();