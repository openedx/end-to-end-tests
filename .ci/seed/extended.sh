#!/usr/bin/env bash
# Seeds the content the `extended` CI profile declares (`.ci/profiles.json`),
# on a Tutor "local" install that the run job has provisioned: the demo course
# is imported, the admin exists and the courses are indexed. Run from the repo
# root with TUTOR_ROOT and ADMIN_USERNAME / ADMIN_EMAIL set.
#
# - multi-org-catalog: a course under a second organization, started (the
#   create_course command backdates the start a week) and indexed for catalog
#   search, so the catalog's organization filter has two values to choose
#   between.
# - course-intro-video: a YouTube intro video on the demo course's About page
#   (SAMPLE_YOUTUBE_ID in src/api/course-content.ts). The course API serves it
#   from the course overview, so the overview is rebuilt afterwards.
set -euo pipefail
: "${ADMIN_USERNAME:?}" "${ADMIN_EMAIL:?}"

DEMO_COURSE="course-v1:OpenedX+DemoX+DemoCourse"
SECOND_ORG_COURSE="course-v1:E2ESEED+CATALOG2+run1"
INTRO_VIDEO_ID="dQw4w9WgXcQ"

echo "Seeding a second-organization course (${SECOND_ORG_COURSE})..."
tutor local exec cms ./manage.py cms create_course split "$ADMIN_EMAIL" \
  E2ESEED CATALOG2 run1 "E2E second-organization course"
tutor local exec cms ./manage.py cms reindex_course "$SECOND_ORG_COURSE"

echo "Setting the intro video of ${DEMO_COURSE}..."
tutor local exec cms ./manage.py cms shell -c "
from django.contrib.auth import get_user_model
from opaque_keys.edx.keys import CourseKey
from openedx.core.djangoapps.models.course_details import CourseDetails
from xmodule.modulestore.django import modulestore

key = CourseKey.from_string('${DEMO_COURSE}')
user = get_user_model().objects.get(username='${ADMIN_USERNAME}')
CourseDetails.update_about_video(modulestore().get_course(key), '${INTRO_VIDEO_ID}', user.id)
"
tutor local exec lms ./manage.py lms shell -c "
from opaque_keys.edx.keys import CourseKey
from openedx.core.djangoapps.content.course_overviews.models import CourseOverview

overview = CourseOverview.load_from_module_store(CourseKey.from_string('${DEMO_COURSE}'))
print('Course overview video:', overview.course_video_url)
"
