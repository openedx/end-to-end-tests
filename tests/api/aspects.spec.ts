import { expect, test } from '@playwright/test';

import {
  narrowChartData,
  narrowGuestToken,
  narrowInContextDashboard,
  narrowInstructorReports,
  narrowSupersetUser,
  parseChartQuery,
  replayBody,
} from '../../src/api';

// Bodies as the local `main` stack answered them (tutor-contrib-aspects 5.0.0,
// platform-plugin-aspects 2.0.0, Superset 6.1.0).
test.describe('Aspects and Superset readers', { tag: '@unit' }, () => {
  test('narrows the Reports tab config', () => {
    const reports = narrowInstructorReports({
      superset_dashboards: [
        {
          name: 'Course Dashboard',
          slug: 'course-dashboard-en',
          uuid: 'bcb741a1-a100-51f7-803c-6a3b607eb047',
          allow_translations: true,
        },
      ],
      superset_url: 'http://superset.local.openedx.io/',
      superset_guest_token_url:
        'http://local.openedx.io/aspects/superset_guest_token/course-v1:A+B+C',
      show_dashboard_link: true,
    });
    expect(reports).toEqual({
      dashboards: [
        {
          name: 'Course Dashboard',
          slug: 'course-dashboard-en',
          uuid: 'bcb741a1-a100-51f7-803c-6a3b607eb047',
        },
      ],
      supersetUrl: 'http://superset.local.openedx.io/',
      guestTokenUrl: 'http://local.openedx.io/aspects/superset_guest_token/course-v1:A+B+C',
      showDashboardLink: true,
    });
  });

  test('rejects a config without dashboards', () => {
    expect(() => narrowInstructorReports({ superset_url: 'x' })).toThrow('unexpected shape');
  });

  test('narrows a guest token and rejects an empty one', () => {
    expect(narrowGuestToken({ guestToken: 'eyJ0' })).toBe('eyJ0');
    expect(() => narrowGuestToken({ guestToken: '' })).toThrow('unexpected shape');
  });

  test('narrows an in-context dashboard to its filters per run', () => {
    const dashboard = narrowInContextDashboard({
      dashboardId: 'de60faf7-67ed-51ee-8bee-ed260cae978f',
      supersetUrl: 'http://superset.local.openedx.io/',
      courseRuns: { e2e: { native_filters: '(NATIVE_FILTER-QLQbulmHH:())' } },
      defaultCourseRun: 'e2e',
    });
    expect(dashboard.nativeFilters).toEqual({ e2e: '(NATIVE_FILTER-QLQbulmHH:())' });
    expect(dashboard.defaultCourseRun).toBe('e2e');
  });

  const captured = JSON.stringify({
    datasource: { id: 11, type: 'table' },
    force: false,
    form_data: { slice_id: 42, dashboardId: 37, viz_type: 'big_number_total' },
    queries: [{ metrics: ['number_of_learners'], columns: [], filters: [] }],
    result_format: 'json',
    result_type: 'full',
  });

  test('parses a captured chart query to its identifying parts', () => {
    const query = parseChartQuery(captured);
    expect(query).toMatchObject({
      sliceId: 42,
      dashboardId: 37,
      vizType: 'big_number_total',
      metrics: [['number_of_learners']],
      columns: [[]],
    });
  });

  test('reads an ad-hoc metric or column by its label', () => {
    const query = parseChartQuery(
      JSON.stringify({
        form_data: { viz_type: 'table' },
        queries: [{ metrics: [{ label: 'Active Within Last 7 Days' }], columns: ['course_key'] }],
      }),
    );
    expect(query.metrics).toEqual([['Active Within Last 7 Days']]);
    expect(query.columns).toEqual([['course_key']]);
  });

  test('replays the captured body with only force changed', () => {
    const query = parseChartQuery(captured);
    const body = replayBody(query);
    expect(body).toEqual({ ...JSON.parse(captured), force: true });
    // The copy is deep: a caller editing it cannot reach the captured body.
    (body.queries as { metrics: string[] }[])[0]!.metrics.push('count');
    expect(replayBody(query)).toEqual({ ...JSON.parse(captured), force: true });
  });

  test('narrows chart data to rows per query', () => {
    expect(
      narrowChartData({
        result: [
          { colnames: ['number_of_learners'], rowcount: 1, data: [{ number_of_learners: 1 }] },
        ],
      }),
    ).toEqual([
      { colnames: ['number_of_learners'], rowcount: 1, data: [{ number_of_learners: 1 }] },
    ]);
  });

  test('tells a signed-in Superset user from a visitor', () => {
    expect(
      narrowSupersetUser({
        result: {
          isActive: true,
          isAnonymous: false,
          username: 'e2e_x',
          roles: { Instructor: [['can_read', 'Chart']] },
        },
      }),
    ).toEqual({ anonymous: false, roles: ['Instructor'] });
    expect(
      narrowSupersetUser({
        result: { permissions: {}, roles: { Public: [['can_read', 'Chart']] } },
      }),
    ).toEqual({ anonymous: true, roles: ['Public'] });
  });
});
