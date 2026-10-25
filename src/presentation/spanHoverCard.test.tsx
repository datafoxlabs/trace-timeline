import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { mockTrace } from '../model';
import { DdSpanHoverCard } from './DdSpanHoverCard';

describe('span summary card', () => {
  it('uses full trace duration and shows the error footer only for an error span', () => {
    const span = { ...mockTrace.spans[0], operationName: 'http.request', duration: 414000, tags: [{ key: 'resource.name', value: 'GET /order/complex' }] };
    const { getByText, queryByText, rerender } = render(<DdSpanHoverCard span={span} color="blue" traceDuration={1490000} isError />);
    expect(getByText('414ms (27.8% total duration)')).toBeTruthy();
    expect(getByText('http.request')).toBeTruthy();
    expect(getByText('GET /order/complex')).toBeTruthy();
    expect(getByText('Error detected')).toBeTruthy();
    rerender(<DdSpanHoverCard span={span} color="blue" traceDuration={1490000} isError={false} />);
    expect(queryByText('Error detected')).toBeNull();
  });
});
