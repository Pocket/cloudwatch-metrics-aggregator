export declare type Dimension = {
    Name: string;
    Value: string;
};
export declare type BaseMetric = {
    MetricName: string;
    Timestamp?: Date;
    Unit?: string;
    Dimensions?: Dimension[];
};
export declare type Metric = BaseMetric & {
    Value: number;
};
export declare type MetricSet = BaseMetric & {
    Values: number[];
    Counts?: number[];
};
export declare type MetricArray = Metric[];
/**
 * Represents an aggregate view of several of the same metric datapoints
 * (with 'same' meaning MetricName and Dimensions match).
 */
export declare class AggregatedMetric implements Metric, MetricSet {
    Dimensions?: Dimension[];
    MetricName: string;
    Timestamp?: Date;
    Unit?: string;
    Value: number;
    Values: number[];
    protected _metrics: Metric[];
    constructor(metric: Metric);
    push(metric: Metric): this;
    count(): number;
    getMetric(): Metric;
    getMetricSet(): MetricSet;
    /**
     * JSON view defaults to metric set
     */
    toJSON(): MetricSet;
}
export declare type AggregateMetricMap = {
    [key: string]: AggregatedMetric;
};
export declare class AggregateMetricQueue {
    private queue;
    /**
     * Adds 0 or more metrics.
     * @param metrics
     */
    addMetrics(...metrics: Metric[]): this;
    /**
     * Reduces queue of metrics into aggregate metric values and clears queue.
     */
    reduceAndClear(limit?: number): AggregatedMetric[];
    /**
     * Wraps a call to `reduceAndClear()` with `coalesce()`
     * @param limit
     */
    coalesceAndClear(limit?: number): MetricSet[];
    count(): number;
    /**
     * Generates a unique key for given metric and attempts to look up the corresponding aggregator in the map.
     * If found, pushes metric onto aggregate metric, otherwise creates a new aggregate in map.
     * @param metric
     * @param map
     */
    static mapMetricToAggregator(metric: Metric, map: AggregateMetricMap): void;
    /**
     * Combines values across the same MetricName regardless of dimension. Note that if only
     * metrics for a particular MetricName are present WITH dimensions, an extra metric is
     * created WITHOUT dimensions that contains the coalesced values. Example:
     *
     * ```
     * # input
     * [ {MetricName: M1, Dimensions: [...], ...},
     *   {MetricName: M1, Dimensions: [...], ...} ]
     *
     * # output
     * [ {MetricName: M1, Values: [...], ...}, # dimension-less
     *   {MetricName: M1, Dimensions: [...], ...},
     *   {MetricName: M1, Dimensions: [...], ...} ]
     * ```
     *
     * @param metrics
     */
    static coalesce(metrics: AggregatedMetric[]): MetricSet[];
}
export declare type HandlerCallback = (metrics: Metric[], metricsCoalesced: MetricSet[]) => any;
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
export declare class AggregateMetricTimedHandler {
    private timer;
    private interval;
    private queue;
    private callback;
    constructor(queue: AggregateMetricQueue, callback: HandlerCallback);
    start(interval?: number): void;
    protected process(): void;
    cancel(): void;
}
