class MetricsCollector {
    private counters: Map<string, number> = new Map();
    private histograms: Map<string, number[]> = new Map();

    private key(name: string, labels: Record<string, string> = {}): string {
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return labelStr ? `${name}{${labelStr}}` : name;
    }

    inc(name: string, labels?: Record<string, string>, value: number = 1): void {
        const k = this.key(name, labels);
        this.counters.set(k, (this.counters.get(k) || 0) + value);
    }

    observe(name: string, labels: Record<string, string>, value: number): void {
        const k = this.key(name, labels);
        const existing = this.histograms.get(k) || [];
        existing.push(value);
        this.histograms.set(k, existing);
    }

    recordHttpRequest(method: string, path: string, status: number, durationMs: number): void {
        const labels = { method, path: this.sanitizePath(path), status: String(status) };
        this.inc('http_requests_total', labels);
        this.observe('http_request_duration_ms', { method, path: this.sanitizePath(path) }, durationMs);
    }

    private sanitizePath(path: string): string {
        return path.replace(/\/[0-9a-f-]{8,}/g, '/:id').replace(/\/\d+/g, '/:num');
    }

    format(): string {
        const lines: string[] = [];
        for (const [k, v] of this.counters.entries()) {
            lines.push(`# TYPE ${k.split('{')[0]} counter`);
            lines.push(`${k} ${v}`);
        }
        for (const [k, values] of this.histograms.entries()) {
            const baseName = k.split('{')[0];
            lines.push(`# TYPE ${baseName} histogram`);
            lines.push(`${k}_count ${values.length}`);
            lines.push(`${k}_sum ${values.reduce((a, b) => a + b, 0)}`);
            const buckets = [10, 50, 100, 250, 500, 1000, 5000];
            for (const b of buckets) {
                const count = values.filter(v => v <= b).length;
                lines.push(`${k}_bucket{le="${b}"} ${count}`);
            }
            lines.push(`${k}_bucket{le="+Inf"} ${values.length}`);
        }
        return lines.join('\n') + '\n';
    }
}

export const metrics = new MetricsCollector();
