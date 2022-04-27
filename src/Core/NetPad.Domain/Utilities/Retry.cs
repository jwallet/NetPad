using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace NetPad.Utilities;

public static class Retry
{
    public static void Execute(int maxAttemptCount, TimeSpan retryInterval, Action action)
    {
        var exceptions = new List<Exception>();

        for (int iAttempt = 0; iAttempt < maxAttemptCount; iAttempt++)
        {
            try
            {
                if (iAttempt > 0)
                    Thread.Sleep(retryInterval);

                action();
                exceptions.Clear();
                break;
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        }

        if (exceptions.Any())
            throw new AggregateException(exceptions);
    }

    public static async Task ExecuteAsync(int maxAttemptCount, TimeSpan retryInterval, Func<Task> action)
    {
        var exceptions = new List<Exception>();

        for (int iAttempt = 0; iAttempt < maxAttemptCount; iAttempt++)
        {
            try
            {
                if (iAttempt > 0)
                    await Task.Delay(retryInterval);

                await action();
                exceptions.Clear();
                break;
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        }

        if (exceptions.Any())
            throw new AggregateException(exceptions);
    }
}
