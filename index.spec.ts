import {
	Metric,
	AggregateMetricQueue,
	HandlerCallback,
	AggregateMetricTimedHandler,
	Dimension,
	MetricSet,
} from "./index";
import { expect } from "chai";
import "mocha";

describe("CloudWatch Metric Helper", () => {
	const metric1: Metric = {
		MetricName: "m1",
		Value: 1,
	};

	const metric1Dim: Metric = {
		MetricName: "m1",
		Value: 1,
		Dimensions: [
			{
				Name: "height",
				Value: "5 ft",
			},
		],
	};

	describe("AggregateMetricQueue", () => {
		let subject: AggregateMetricQueue;

		beforeEach(() => {
			subject = new AggregateMetricQueue();
		});

		it("reduces 2 of the same metrics into 1", () => {
			subject.addMetrics({ ...metric1 }).addMetrics({ ...metric1 });

			const metrics: Metric[] = subject.reduceAndClear();
			expect(metrics.length).to.eq(1);
			expect(metrics[0]).to.include({ MetricName: "m1", Value: 2 });
			expect(subject.count()).to.eq(0);
		});

		it("reduces 2 different metrics", () => {
			subject.addMetrics(
				{ ...metric1 },
				{ ...metric1 },
				{ ...metric1Dim },
				{ ...metric1Dim, Value: 5 }
			);

			const metrics: Metric[] = subject.reduceAndClear();
			expect(metrics.length).to.eq(2);
			expect(metrics[0]).to.include({ MetricName: "m1", Value: 2 });
			expect(metrics[1]).to.include({ ...metric1Dim, Value: 6 });
		});

		it("only processes first 2 metrics in queue", () => {
			// 3rd metric should be ignored
			subject.addMetrics(
				{ ...metric1 },
				{ ...metric1Dim },
				{ ...metric1Dim, Value: 5 }
			);

			const metrics: Metric[] = subject.reduceAndClear(2);
			expect(metrics.length).to.eq(2);
			expect(metrics[0].Value).to.eq(1);
			expect(metrics[1].Value).to.eq(1);
		});

		it("aggregates the same dimensions together regardless of key order", () => {
			const m1 = {
				...metric1,
				Dimensions: [
					{ Name: "abc", Value: "xyz" },
					{ Name: "xyz", Value: "abc" },
				],
			};
			const m2 = {
				...metric1,
				Dimensions: [
					{ Name: "xyz", Value: "abc" },
					{ Name: "abc", Value: "xyz" },
				],
			};
			subject.addMetrics(m1, m2);
			const metrics = subject.reduceAndClear();
			expect(metrics.length).to.eq(1);
			expect(metrics[0].Value).to.eq(2);
		});
	});

	describe("AggregateMetricQueue - Statistical Sets", () => {
		let subject: AggregateMetricQueue;

		beforeEach(() => {
			subject = new AggregateMetricQueue();
		});

		it("coalesces 2 similar metrics", () => {
			subject
				.addMetrics({ ...metric1 })
				.addMetrics({ ...metric1Dim, Value: 3 });

			const metrics: MetricSet[] = subject.coalesceAndClear();
			expect(metrics.length).to.eq(2);
			expect(JSON.stringify(metrics[0].Values)).to.eq(
				JSON.stringify([1, 3])
			);
			expect(metrics[0].Dimensions).to.eq(undefined);
			expect(JSON.stringify(metrics[1].Values)).to.eq(
				JSON.stringify([3])
			);
		});

		it("it expands a metric with dimensions into a coalesced metric without dimensions and original metric", () => {
			subject.addMetrics({ ...metric1Dim, Value: 3 });

			const metrics: MetricSet[] = subject.coalesceAndClear();
			expect(metrics.length).to.eq(2);

			// ensure no extra props are leaking through. this would happen on the original metric object, not the generated
			// coalesced metric
			expect(typeof (metrics[1] as any)._metrics).to.eq("undefined");
			expect(typeof (metrics[1] as any).Value).to.eq("undefined");

			expect(JSON.stringify(metrics[0].Values)).to.eq(
				JSON.stringify([3])
			);
			expect(JSON.stringify(metrics[1].Values)).to.eq(
				JSON.stringify([3])
			);
		});
	});

	describe("AggregateMetricTimedHandler", () => {
		it("aggregates metrics and invokes callback in background twice", () => {
			let ticks = 0;
			let resolver: Function = () => {
				throw new Error("was not set to promise resolver");
			};
			const promise = new Promise((resolve, reject) => {
				resolver = resolve;
			});
			const callback: HandlerCallback = (metrics: Metric[]) => {
				ticks++;
				if (ticks === 1) {
					expect(metrics.length).to.eq(2);
				} else if (ticks === 2) {
					resolver(true);
				}
			};

			const queue = new AggregateMetricQueue().addMetrics(
				{ ...metric1 },
				{ ...metric1Dim }
			);
			const subject = new AggregateMetricTimedHandler(queue, callback);
			subject.start(25);
			return promise.then(() => {
				subject.cancel();
			});
		});
		// @todo check metricsCoalesced
	});
});

export default {};
