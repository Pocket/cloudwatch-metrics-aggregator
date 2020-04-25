import {Metric, AggregateMetricQueue, HandlerCallback, AggregateMetricTimedHandler} from "./index";
import { expect } from 'chai';
import 'mocha';

describe("CloudWatch Metric Helper", () => {
    const metric1: Metric = {
        MetricName: 'm1',
        Value: 1
    };

    const metric1Dim: Metric = {
        MetricName: 'm1',
        Value: 1,
        Dimensions: [
            {
                Name: 'height',
                Value: "5 ft"
            }
        ]
    };

    describe('AggregateMetricQueue', () => {
        let subject: AggregateMetricQueue;

        beforeEach(() => {
            subject = new AggregateMetricQueue();
        });

        it('reduces 2 of the same metrics into 1', () => {
            subject.addMetrics({...metric1}).addMetrics({...metric1});

            const metrics: Metric[] = subject.reduceAndClear();
            expect(metrics.length).to.eq(1);
            expect(metrics[0]).to.include({MetricName: 'm1', Value: 2});
            expect(subject.count()).to.eq(0);
        });

        it('reduces 2 different metrics', () => {
            subject.addMetrics(
                {...metric1}, {...metric1},
                {...metric1Dim}, {...metric1Dim, Value: 5},
            );

            const metrics: Metric[] = subject.reduceAndClear();
            expect(metrics.length).to.eq(2);
            expect(metrics[0]).to.include({MetricName: 'm1', Value: 2});
            expect(metrics[1]).to.include({...metric1Dim, Value: 6});
        });
    });

    describe('AggregateMetricTimedHandler', () => {
       it('aggregates metrics and invokes callback in background twice', () => {
           let ticks = 0;
           let resolver: Function = () => {
               throw new Error('was not set to promise resolver');
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
           const queue = new AggregateMetricQueue().addMetrics({...metric1}, {...metric1Dim});

           const subject = new AggregateMetricTimedHandler(queue, callback);
           subject.start(25);

           return promise.then(() => {
               subject.cancel();
           });
       })
    });
});

export default {};
