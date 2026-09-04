#!/bin/sh
set -eu

awslocal sqs create-queue \
  --queue-name "${SQS_WAGER_TRANSACTIONS_DLQ:-wager-transactions-dlq.fifo}" \
  --attributes FifoQueue=true,ContentBasedDeduplication=true

DLQ_URL=$(awslocal sqs get-queue-url --queue-name "${SQS_WAGER_TRANSACTIONS_DLQ:-wager-transactions-dlq.fifo}" --query QueueUrl --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sqs create-queue \
  --queue-name "${SQS_WAGER_TRANSACTIONS_QUEUE:-wager-transactions.fifo}" \
  --attributes FifoQueue=true,ContentBasedDeduplication=true

ATTRIBUTES_FILE=$(mktemp)
printf '{"RedrivePolicy":"{\\"deadLetterTargetArn\\":\\"%s\\",\\"maxReceiveCount\\":\\"%s\\"}"}' "$DLQ_ARN" "${SQS_MAX_ATTEMPTS:-5}" > "$ATTRIBUTES_FILE"
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name "${SQS_WAGER_TRANSACTIONS_QUEUE:-wager-transactions.fifo}" --query QueueUrl --output text)
awslocal sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes "file://$ATTRIBUTES_FILE"
rm -f "$ATTRIBUTES_FILE"

awslocal sqs create-queue \
  --queue-name "${SQS_EVENTS_QUEUE:-wager-events.fifo}" \
  --attributes FifoQueue=true,ContentBasedDeduplication=true
