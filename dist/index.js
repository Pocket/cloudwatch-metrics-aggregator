"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Represents an aggregate view of several of the same metric datapoints.
 */
class AggregatedMetric {
    constructor(metric) {
        this.Values = [];
        this._metrics = [];
        this.MetricName = metric.MetricName;
        this.Value = metric.Value;
        this.Values.push(metric.Value);
        this.Dimensions = metric.Dimensions;
    }
    push(metric) {
        this._metrics.push(metric);
        this.Values.push(metric.Value);
        this.Value = this.Values.reduce((pv, cv) => pv + cv);
        return this;
    }
    count() {
        return this._metrics.length;
    }
    getMetric() {
        return {
            MetricName: this.MetricName,
            Dimensions: this.Dimensions,
            Timestamp: this.Timestamp,
            Unit: this.Unit,
            Value: this.Value,
        };
    }
    getMetricSet() {
        return {
            MetricName: this.MetricName,
            Dimensions: this.Dimensions,
            Timestamp: this.Timestamp,
            Unit: this.Unit,
            Values: this.Values,
        };
    }
}
exports.AggregatedMetric = AggregatedMetric;
class AggregateMetricQueue {
    constructor(params) {
        this.useStatisticalSet = false;
        this.queue = [];
        const { useStatisticalSet } = { ...(params || {}) };
        this.useStatisticalSet = !!useStatisticalSet;
    }
    /**
     * Adds 0 or more metrics.
     * @param metrics
     */
    addMetrics(...metrics) {
        metrics.forEach((m) => this.queue.push(m));
        return this;
    }
    /**
     * Reduces queue of metrics into aggregate metric values and clears queue.
     */
    reduceAndClear(limit) {
        const map = {};
        let metric = this.queue.shift();
        let counter = 0;
        while (metric && (!limit || counter < limit)) {
            AggregateMetricQueue.mapMetricToAggregator(metric, map);
            metric = this.queue.shift();
            counter++;
        }
        const arr = [];
        for (let k in map) {
            arr.push(map[k]);
        }
        return arr;
    }
    /**
     * Wraps a call to `reduceAndClear()` with `coalesce()`
     * @param limit
     */
    coalesceAndClear(limit) {
        return AggregateMetricQueue.coalesce(this.reduceAndClear(limit));
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
    static mapMetricToAggregator(metric, map) {
        // @todo sort dimensions by name to ensure proper matching of all dimension orders in same set
        const keyMap = { MetricName: metric.MetricName };
        if (metric.Dimensions && metric.Dimensions.length > 0) {
            keyMap.Dimensions = metric.Dimensions.sort((a, b) => {
                if (a.Name > b.Name)
                    return 1;
                else if (a.Name < b.Name)
                    return -1;
                else
                    return 0;
            });
        }
        const keyStr = JSON.stringify(keyMap);
        if (!map[keyStr]) {
            map[keyStr] = new AggregatedMetric(metric);
        }
        else {
            map[keyStr].push(metric);
        }
    }
    /**
     * Combines values across the same MetricName regardless of dimension.
     * @param metrics
     */
    static coalesce(metrics) {
        const cmap = {};
        for (let metric of metrics) {
            if (!cmap[metric.MetricName]) {
                cmap[metric.MetricName] = metric.getMetricSet();
            }
            else {
                cmap[metric.MetricName].Values = cmap[metric.MetricName].Values.concat(metric.getMetricSet().Values);
            }
        }
        const arr = [];
        for (let k in cmap) {
            arr.push(cmap[k]);
        }
        return arr;
    }
}
exports.AggregateMetricQueue = AggregateMetricQueue;
/**
 * Handler runs at a set interval and executes callback with reduced metrics from queue. This can be used to
 * collect metrics across multiple different actions and automatically aggregate and send to CloudWatch in the
 * background.
 *
 * ```typescript
 * const queue = new AggregateMetricQueue();
 * const callback: HandlerCallback = (metrics: Metric[], metricsCoalesced: MetricSet[]) => {
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
class AggregateMetricTimedHandler {
    constructor(queue, callback) {
        this.timer = null;
        this.interval = 1000;
        this.queue = queue;
        this.callback = callback;
    }
    start(interval) {
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
    process() {
        const metrics = this.queue.reduceAndClear(this.queue.count());
        const metricsCoalesced = AggregateMetricQueue.coalesce(metrics);
        this.callback(metrics, metricsCoalesced);
    }
    cancel() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }
}
exports.AggregateMetricTimedHandler = AggregateMetricTimedHandler;
