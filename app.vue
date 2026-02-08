<script setup>
import 'vue-sonner/style.css'
import './utils/polyfills'
import { Toaster } from 'vue-sonner'

console.log('------------ initializing posthog ------------')
!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init rs ls wi ns us ts ss capture calculateEventProperties vs register register_once register_for_session unregister unregister_for_session gs getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty fs ds createPersonProfile setInternalOrTestUser ps Qr opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing hs debug M cs getPageViewId captureTraceFeedback captureTraceMetric Kr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_gWAN0CJUpZb8p03QSY8TP09FJGuM9Kd4P54h7C1yySt', {
  api_host: 'https://us.i.posthog.com',
  defaults: '2025-11-30',
  person_profiles: 'always',
})
// posthog.debug()
posthog.capture('test event three', { property: 'value' })

const config = useConfig()

console.log('------------ initializing app ------------')
console.log('version: ', config.version)

useHead({
  title: config.title,
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: config.icon }
  ]
})

onMounted(async () => {
  const route = useRoute()
  if (route.query.jump && typeof route.query.jump === 'string') {
    console.log('Jumping to epoch from URL param:', route.query.jump)
    await timeoutPromise(0)
    await jumpToEpoch(route.query.jump)
  }
})


useErrorHandler() // initialize

</script>

<template>
  <NuxtLayout>
    <Toaster richColors closeButton position="top-left" />
    <NuxtPage />
  </NuxtLayout>
</template>

<style>

:root {
  font-family: helvetica, arial, sans-serif;
  font-size: 16px;
  color: #101010;
  background-color: #ffffff;
}

button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}

input, select, textarea {
  outline: inherit;
}

a {
  @apply text-blue underline;
}

h1 { font-size: 2em; font-weight: bold; }
h2 { font-size: 1.5em; font-weight: bold; }
h3 { font-size: 1.17em; font-weight: bold; }
h4 { font-size: 1em; font-weight: bold; }
h5 { font-size: 0.83em; font-weight: bold; }
h6 { font-size: 0.67em; font-weight: bold; }

/* ensure scrollbar doesn't mess with layout */
:root, html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

/* used by usePhases transitions */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes pop {
  from { transform: scale(1); }
  to { transform: scale(1.1); }
}

</style>