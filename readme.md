# CloudWatch Metrics Aggregator

This simple library provides a basic queue to collect CloudWatch metrics and reduce them to an aggregated set of unique datapoints whose values represent the datapoints for each unique metric.

```typescript
const queue = new AggregateMetricQueue();
queue.addMetrics(
    {
        MetricName: 'm1',
        Value: 1
    },
    {
        MetricName: 'm1',
        Value: 2
    },
    {
        MetricName: 'm1',
        Value: 1,
        Dimensions: [
            {Name: 'weight', Value: '10lb'}        
        ]
    }
);

const metrics = queue.reduceAndClear();
metrics === [
    {
        MetricName: 'm1',
        Value: 3
    },
    {
        MetricName: 'm1',
        Value: 1,
        Dimensions: [
            {Name: 'weight', Value: '10lb'}        
        ]
    }
];
```

There's also a convenient scheduled handler that executes at a specified interval to process the queue. This lets you easily collect metrics from several sources and aggregate/push them in a way that keeps a large volume of metrics below AWS rate limiting thresholds:

```typescript
// collect and send metrics every second
const handler = new AggregateMetricTimedHandler(queue, (metrics: Metric[]) => {
    cloudwatchClient.pushMetricData({
        Namespace: 'Your-Namespace',
        MetricData: metrics    
    });
});
handler.start(1000);
```
