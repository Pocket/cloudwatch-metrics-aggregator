export type Dimension = {
    Name: string
    Value: string
};

export type Metric = {
    MetricName: string
    Value: number
    Timestamp?: Date
    Unit?: string
    Dimensions?: Dimension[]
};

export type MetricArray = Metric[];

/**
 * Represents an aggregate view of several of the same metric datapoints.
 */
export class AggregatedMetric implements Metric {
    Dimensions?: Dimension[];
    MetricName: string;
    Timestamp?: Date;
    Unit?: string;
    Value: number;
    protected _metrics: Metric[] = [];

    constructor(metric: Metric) {
        this.MetricName = metric.MetricName;
        this.Value = metric.Value;
        this.Dimensions = metric.Dimensions;
    }

    push(metric: Metric): this {
        this._metrics.push(metric);
        this.Value = this.Value ? this.Value + metric.Value : metric.Value;
        return this;
    }

    count() {
        return this._metrics.length;
    }
}

export type AggregateMetricMap = {
    [key: string]: AggregatedMetric
};

export class AggregateMetricQueue {
    private queue: MetricArray = [];

    /**
     * Adds 0 or more metrics.
     * @param metrics
     */
    addMetrics(...metrics: Metric[]): this {
        metrics.forEach((m) => this.queue.push(m));
        return this;
    }

    /**
     * Reduces queue of metrics into aggregate metric values and clears queue.
     */
    reduceAndClear(limit?: number): AggregatedMetric[] {
        const map: AggregateMetricMap = {};

        let metric = this.queue.shift();
        let counter = 0;
        while (metric && (!limit || (counter < limit))) {
            AggregateMetricQueue.mapMetricToAggregator(metric, map);
            metric = this.queue.shift();
            counter++;
        }

        const arr: AggregatedMetric[] = [];
        for (let k in map) {
            arr.push(map[k]);
        }

        return arr;
    }

    count() {
        return this.queue.length;
    }

    /**
     * Generates a unique key for given metric and attempts to look up the corresponding aggregator in the map.
     * If found, pushes metric onto aggregate metric, otherwise creates a new aggregate in map.
     * @param metric
     * @param map
     */
    static mapMetricToAggregator(metric: Metric, map: AggregateMetricMap) {
        const keyMap: any = {MetricName: metric.MetricName};
        if (metric.Dimensions && metric.Dimensions.length > 0) {
            keyMap.Dimensions = metric.Dimensions;
        }

        const keyStr = JSON.stringify(keyMap);
        if (!map[keyStr]) {
            map[keyStr] = new AggregatedMetric(metric);
        } else {
            map[keyStr].push(metric);
        }
    }
}

export type HandlerCallback = (metrics: Metric[]) => any;

/**
 * Handler runs at a set interval and executes callback with reduced metrics from queue. This can be used to
 * collect metrics across multiple different actions and automatically aggregate and send to CloudWatch in the
 * background.
 *
 * ```typescript
 * const queue = new AggregateMetricQueue();
 * const callback: HandlerCallback = (metrics: Metric[]) => {
 *     // push to cloudwatch
 * }
 *
 * // every 1 sec, execute callback
 * const handler = new AggregateMetricTimedHandler(queue, callback);
 * handler.start(1000);
 *
 * // in shutdown routine
 * handler.cancel();
 * ```
 */
export class AggregateMetricTimedHandler {
    private timer: any = null;
    private interval: number = 1000;
    private queue: AggregateMetricQueue;
    private callback: HandlerCallback;

    constructor(queue: AggregateMetricQueue, callback: HandlerCallback) {
        this.queue = queue;
        this.callback = callback;
    }

    start(interval?: number) {
        if (this.timer) {
            return;
        }

        if (interval && interval > 0) {
            this.interval = interval;
        }

        this.timer = setInterval(() => {
            this.process();
        }, this.interval);
    }

    protected process() {
        this.callback(this.queue.reduceAndClear(this.queue.count()));
    }

    cancel() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }
}
