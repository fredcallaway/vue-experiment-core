<script lang="ts">

export type SurveyChoiceQuestion = {
  id: string
  prompt: string
  options?: string[]
  flags?: string[]
  required?: boolean
}

export type SurveyMultiPrompt = string | SurveyChoiceQuestion

export type SurveyChoicePage = {
  id: string
  kind?: 'choice'
  intro?: string
  prompt: string
  options: string[]
  flags?: string[]
  required?: boolean
}

export type SurveyTextPage = {
  id: string
  kind: 'text'
  intro?: string
  prompt: string
  placeholder?: string
  flags?: string[]
  required?: boolean
}

export type SurveyMultiPage = {
  id: string
  kind: 'multi'
  intro?: string
  sharedPrompt?: string
  options?: string[]
  prompts: SurveyMultiPrompt[]
}

export type SurveyPage = SurveyChoicePage | SurveyTextPage | SurveyMultiPage

const [logStartPage, isStartPage] = declareEventLogger<{
  surveyName: string
  pageId: string
  prompt: string
  options: string[]
}>('survey.startPage')

const [logStartQuestion, isStartQuestion] = declareEventLogger<{
  surveyName: string
  pageId: string
  questionId: string
  question: string
  flags: string[]
  input: 'choice' | 'text'
  options: string[]
}>('survey.startQuestion')

const [logResponse, isResponse] = declareEventLogger<{
  surveyName: string
  pageId: string
  questionId: string
  question: string
  flags: string[]
  input: 'choice' | 'text'
  response: number | string | 'SKIP'
  option: string | null
  rt: number
  skipped: boolean
}>('survey.response')


export function parseSurveySequence(sessionData: SessionData) {
  return R.pipe(
    sessionData.events,
    R.filter(e => isStartPage(e) || isStartQuestion(e) || isResponse(e)),
    chunkBy(isStartPage),
    R.flatMap((chunk) => {
      if (chunk.length === 0) return []

      const pageEvent = chunk[0]
      if (!isStartPage(pageEvent)) return []

      const responses = chunk.slice(1).filter(isResponse)
      return responses.map((r, idx) => {
        const questionStart = chunk
          .slice(1)
          .filter(isStartQuestion)
          .find(e => e.data.questionId === r.data.questionId)
        const options = questionStart?.data.options ?? pageEvent.data.options
        const responseOption = typeof r.data.response === 'number' ? options[r.data.response] : null
        const rt = r.data.rt ?? r.timestamp - (questionStart?.timestamp ?? responses[idx - 1]?.timestamp ?? pageEvent.timestamp)

        return {
          surveyName: r.data.surveyName ?? pageEvent.data.surveyName,
          pageId: r.data.pageId ?? pageEvent.data.pageId,
          questionId: r.data.questionId ?? r.data.question,
          question: r.data.question,
          flags: r.data.flags ?? [],
          input: r.data.input ?? 'choice',
          option: r.data.option ?? responseOption,
          response: r.data.response,
          rt,
          maxResponse: options.length > 0 ? options.length - 1 : null,
          skipped: r.data.skipped ?? r.data.response === 'SKIP',
        }
      })
    })
  )
}

declareDataView('survey-seq', parseSurveySequence)

</script>

<script lang="ts" setup>


interface ParsedQuestion {
  question: string
  flags: string[]
}

function parseQuestion(raw: string): ParsedQuestion {
  const match = raw.match(/^\[([\w\d_\s]+)\]\s*(.*)$/)
  if (!match) return { question: raw, flags: [] }
  const flags = match[1].split(/\s+/).filter(f => f.length > 0)
  const question = match[2]
  return { question, flags }
}

type NormalizedQuestion = {
  id: string
  prompt: string
  input: 'choice' | 'text'
  options: string[]
  flags: string[]
  required: boolean
  placeholder: string
}

type NormalizedPage = {
  pageId: string
  sharedPrompt: string
  intro: string
  options: string[]
  questions: NormalizedQuestion[]
}

const props = defineProps<{
  pages: SurveyPage[]
  name?: string
  shufflePages?: boolean
  shuffleQuestions?: boolean
  fadeMs?: NumberLike
}>()

const fadeMs = computed(() => ensureNumber(props.fadeMs ?? 500))
const fadeDuration = computed(() => `${fadeMs.value}ms`)

function questionIdFromPrompt(prompt: string, idx: number) {
  const id = prompt
    .toLowerCase()
    .replace(/[^\w\d]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || `q${idx + 1}`
}

function normalizeQuestion(
  rawQuestion: SurveyMultiPrompt,
  pageOptions: string[],
  idx: number
): NormalizedQuestion {
  if (typeof rawQuestion === 'string') {
    const parsed = parseQuestion(rawQuestion)
    return {
      id: questionIdFromPrompt(parsed.question, idx),
      prompt: parsed.question,
      input: 'choice',
      options: pageOptions,
      flags: parsed.flags,
      required: false,
      placeholder: '',
    }
  }

  return {
    id: rawQuestion.id,
    prompt: rawQuestion.prompt,
    input: 'choice',
    options: rawQuestion.options ?? pageOptions,
    flags: rawQuestion.flags ?? [],
    required: rawQuestion.required ?? false,
    placeholder: '',
  }
}

function normalizePage(page: SurveyPage): NormalizedPage {
  if (page.kind === 'multi') {
    const options = page.options ?? []
    return {
      pageId: page.id,
      sharedPrompt: page.sharedPrompt ?? '',
      intro: page.intro ?? '',
      options,
      questions: page.prompts.map((prompt, idx) => normalizeQuestion(prompt, options, idx)),
    }
  }

  if (page.kind === 'text') {
    return {
      pageId: page.id,
      sharedPrompt: '',
      intro: page.intro ?? '',
      options: [],
      questions: [{
        id: page.id,
        prompt: page.prompt,
        input: 'text',
        options: [],
        flags: page.flags ?? [],
        required: page.required ?? false,
        placeholder: page.placeholder ?? '',
      }],
    }
  }

  return {
    pageId: page.id,
    sharedPrompt: '',
    intro: page.intro ?? '',
    options: page.options,
    questions: [{
      id: page.id,
      prompt: page.prompt,
      input: 'choice',
      options: page.options,
      flags: page.flags ?? [],
      required: page.required ?? false,
      placeholder: '',
    }],
  }
}

function normalizePages() {
  return props.pages.map(normalizePage)
}

const rng = useRandom(props.name ?? 'Survey').reset()

let shuffledPages = normalizePages()
  .map(page => ({
    ...page,
    questions: props.shuffleQuestions ? rng.shuffle(page.questions) : page.questions,
  }))

if (props.shufflePages) {
  shuffledPages = rng.shuffle(shuffledPages)
}

const totalQuestions = shuffledPages.reduce((total, page) => total + page.questions.length, 0)

const E = useIndexableEpoch(props.name ?? 'Survey', shuffledPages.length)
const step = E.step
assert(R.isNumber(step.value), `step.value is not a number: ${step.value}`)

const showIntro = ref(true)
const currentQuestionIndex = ref(0)
const textResponse = ref('')
const questionStartedAt = ref(Date.now())
const startedQuestionKey = ref('')
const isComplete = ref(false)
const isCompleting = ref(false)

const currentPage = computed(() => shuffledPages[step.value])

const currentQuestion = computed(() => currentPage.value.questions[currentQuestionIndex.value])

const currentQuestionKey = computed(() => `${currentPage.value.pageId}:${currentQuestion.value.id}`)

const totalQuestionIndex = computed(() => {
  const priorQuestions = shuffledPages
    .slice(0, step.value)
    .reduce((total, page) => total + page.questions.length, 0)
  return priorQuestions + currentQuestionIndex.value + 1
})

const isLastQuestionInPage = computed(
  () => currentQuestionIndex.value === currentPage.value.questions.length - 1
)

const isLastPage = computed(() => step.value === shuffledPages.length - 1)

watchImmediate(step, () => {
  showIntro.value = currentPage.value.intro.length > 0
  textResponse.value = ''
  logStartPage({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.pageId,
    prompt: currentPage.value.sharedPrompt,
    options: currentPage.value.options,
  })
})

watchImmediate([step, currentQuestionIndex, showIntro], () => {
  if (showIntro.value) return
  const key = currentQuestionKey.value
  if (startedQuestionKey.value === key) return
  startedQuestionKey.value = key
  questionStartedAt.value = Date.now()

  logStartQuestion({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.pageId,
    questionId: currentQuestion.value.id,
    question: currentQuestion.value.prompt,
    flags: currentQuestion.value.flags,
    input: currentQuestion.value.input,
    options: currentQuestion.value.options,
  })
})

function selectResponse(value: string) {
  if (isCompleting.value) return
  const optionIndex = currentQuestion.value.options.indexOf(value)
  
  logResponse({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.pageId,
    questionId: currentQuestion.value.id,
    question: currentQuestion.value.prompt,
    flags: currentQuestion.value.flags,
    input: currentQuestion.value.input,
    response: optionIndex,
    option: value,
    rt: Date.now() - questionStartedAt.value,
    skipped: false,
  })

  advanceQuestion()
}

function submitTextResponse() {
  if (isCompleting.value) return
  logResponse({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.pageId,
    questionId: currentQuestion.value.id,
    question: currentQuestion.value.prompt,
    flags: currentQuestion.value.flags,
    input: currentQuestion.value.input,
    response: textResponse.value,
    option: null,
    rt: Date.now() - questionStartedAt.value,
    skipped: false,
  })

  advanceQuestion()
}

function skipQuestion() {
  if (isCompleting.value) return
  logResponse({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.pageId,
    questionId: currentQuestion.value.id,
    question: currentQuestion.value.prompt,
    flags: currentQuestion.value.flags,
    input: currentQuestion.value.input,
    response: 'SKIP',
    option: null,
    rt: Date.now() - questionStartedAt.value,
    skipped: true,
  })

  advanceQuestion()
}

function advanceQuestion() {
  textResponse.value = ''
  startedQuestionKey.value = ''
  if (isLastQuestionInPage.value) {
    if (isLastPage.value) {
      finishSurvey()
    } else {
      currentQuestionIndex.value = 0
      step.value++
    }
  } else {
    currentQuestionIndex.value++
  }
}

function finishSurvey() {
  if (isCompleting.value) return
  isCompleting.value = true
  isComplete.value = true
  window.setTimeout(() => E.done(), fadeMs.value)
}
</script>

<template>
  <div max-w-800px mx-auto flex flex-col>
    <Transition name="page" mode="out-in">
      <div v-if="!isComplete" :key="step" flex flex-col gap-8 flex-1>

        <template v-if="showIntro">
          <div w-140 mx-auto flex-center gap-4>
            <p text-xl text-center leading-relaxed m-0 v-html="currentPage.intro" />
            <PButton value="Start" @click="showIntro = false; logEvent('survey.start')" />
          </div>
        </template>
        <template v-else>
          <div v-if="currentPage.sharedPrompt" text-center italic v-html="currentPage.sharedPrompt" />
          <div flex-1 flex items-center justify-center min-h-150px>
            <p text-xl text-center leading-relaxed m-0>{{ currentQuestion.prompt }}</p>
          </div>

          <PButtons
            v-if="currentQuestion.input === 'choice'"
            :values="currentQuestion.options"
            @click="selectResponse"
          />

          <div v-else flex flex-col gap-4 items-center>
            <textarea
              v-model="textResponse"
              input
              rows="4"
              w-full
              max-w-620px
              :placeholder="currentQuestion.placeholder"
            />
            <PButton
              value="Submit"
              :disabled="currentQuestion.required && textResponse.trim().length === 0"
              @click="submitTextResponse"
            />
          </div>

          <div v-if="!currentQuestion.required" flex justify-center mt-4>
            <PButton value="Skip" btn-gray @click="skipQuestion" />
          </div>

          <div text-center text-gray-600 text-sm pt-4>
            <span>
              Question {{ totalQuestionIndex }} of {{ totalQuestions }}
            </span>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity v-bind(fadeDuration), transform v-bind(fadeDuration);
}

.page-enter-from {
  opacity: 0;
/* transform: translateX(40px); */
}

.page-leave-to {
  opacity: 0;
/* transform: translateX(-40px); */
}
</style>
