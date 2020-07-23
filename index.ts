export type Dimension = {
	Name: string;
	Value: string;
};

export type BaseMetric = {
	MetricName: string;
	Timestamp?: Date;
	Unit?: string;
	Dimensions?: Dimension[];
};

export type Metric = BaseMetric & {
	Value: number;
};

export type MetricSet = BaseMetric & {
	Values: number[];
	Counts?: number[];
};

export type MetricArray = Metric[];

/**
 * Represents an aggregate view of several of the same metric datapoints.
 */
export class AggregatedMetric implements Metric, MetricSet {
	Dimensions?: Dimension[];
	MetricName: string;
	Timestamp?: Date;
	Unit?: string;
	Value: number;
	Values: number[] = [];

	protected _metrics: Metric[] = [];

	constructor(metric: Metric) {
		this.MetricName = metric.MetricName;
		this.Value = metric.Value;
		this.Values.push(metric.Value);
		this.Dimensions = metric.Dimensions;
	}

	push(metric: Metric): this {
		this._metrics.push(metric);
		this.Values.push(metric.Value);
		this.Value = this.Values.reduce((pv, cv) => pv + cv);
		return this;
	}

	count() {
		return this._metrics.length;
	}

	getMetric(): Metric {
		return {
			MetricName: this.MetricName,
			Dimensions: this.Dimensions,
			Timestamp: this.Timestamp,
			Unit: this.Unit,
			Value: this.Value,
		};
	}

	getMetricSet(): MetricSet {
		return {
			MetricName: this.MetricName,
			Dimensions: this.Dimensions,
			Timestamp: this.Timestamp,
			Unit: this.Unit,
			Values: this.Values,
		};
	}
}

export type AggregateMetricMap = {
	[key: string]: AggregatedMetric;
};

export type AggregatorOptions = {
	useStatisticalSet?: boolean;
};

export class AggregateMetricQueue {
	private useStatisticalSet = false;
	private queue: MetricArray = [];

	constructor(params?: AggregatorOptions) {
		const { useStatisticalSet } = { ...(params || {}) };
		this.useStatisticalSet = !!useStatisticalSet;
	}

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
		while (metric && (!limit || counter < limit)) {
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

	/**
	 * Wraps a call to `reduceAndClear()` with `coalesce()`
	 * @param limit
	 */
	coalesceAndClear(limit?: number): MetricSet[] {
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
	static mapMetricToAggregator(metric: Metric, map: AggregateMetricMap) {
		// @todo sort dimensions by name to ensure proper matching of all dimension orders in same set
		const keyMap: any = { MetricName: metric.MetricName };
		if (metric.Dimensions && metric.Dimensions.length > 0) {
			keyMap.Dimensions = metric.Dimensions.sort((a, b) => {
				if (a.Name > b.Name) return 1;
				else if (a.Name < b.Name) return -1;
				else return 0;
			});
		}

		const keyStr = JSON.stringify(keyMap);
		if (!map[keyStr]) {
			map[keyStr] = new AggregatedMetric(metric);
		} else {
			map[keyStr].push(metric);
		}
	}

	/**
	 * Combines values across the same MetricName regardless of dimension. Note that if only
	 * metrics for a particular MetricName are present WITH dimensions, an extra metric is
	 * created WITHOUT dimensions that contains the coalesced values. Example:
	 *
	 * ```
	 * # input
	 * [ {MetricName: M1, Dimensions: [...], ...}, {MetricName: M1, Dimensions: [...], ...} ]
	 *
	 * # output
	 * [ {MetricName: M1, Values: [...], ...}, {MetricName: M1, Dimensions: [...], ...}, {MetricName: M1, Dimensions: [...], ...}]
	 * ```
	 *
	 * @param metrics
	 */
	static coalesce(metrics: AggregatedMetric[]) {
		const cmap: { [key: string]: MetricSet } = {};
		for (let metric of metrics) {
			const keyCoalesce = metric.MetricName + "[]";
			const keyUnique =
				metric.MetricName + JSON.stringify(metric.Dimensions ?? []);

			if (!cmap[keyCoalesce]) {
				cmap[keyCoalesce] = metric.getMetricSet();
			} else {
				cmap[keyCoalesce].Values = cmap[keyCoalesce].Values.concat(
					metric.getMetricSet().Values
				);
			}

			if (keyCoalesce != keyUnique) {
				cmap[keyUnique] = metric;
			}
		}

		const arr: MetricSet[] = [];
		for (let k in cmap) {
			arr.push(cmap[k]);
		}

		return arr;
	}
}

export type HandlerCallback = (
	metrics: Metric[],
	metricsCoalesced: MetricSet[]
) => any;

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
