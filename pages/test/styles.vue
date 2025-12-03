<script lang="ts" setup >

defineWindowSize({
  width: 1000,
  height: 600,
})

const classes = [
  'btn',
  'unstyled',
  'btn-primary',
  'btn-red',
  'btn-yellow',
  'btn-green',
  'btn-blue',
  'btn-purple',
]

</script>

<template>
  <div flex="~ col gap-2">
    <h1>Hello world!</h1>
    <div flex="~ row gap-2">
      <button v-for="cls in classes" :class="cls" :key="cls">{{ cls }}</button>
    </div>
    
    <div flex="~ row gap-2 items-center">
      <button btn-xs >btn-xs</button>
      <button btn-sm >btn-sm</button>
      <button btn >btn</button>
      <button btn-lg >btn-lg</button>
      <button btn-blue-lg >btn-blue-lg</button>
      <button btn-purple btn-sm >btn-purple btn-sm</button>
    </div>


    <div flex="~ row gap-2">
      <div w-full card-gray >
        <h3>This is a card</h3>
        It is fancy
      </div>
      <div w-full card-red >
        <h3>This is a card</h3>
        It is fancy
      </div>
    </div>

    <div class="flex flex-col gap-2 bg-base-200 w-50% mx-auto p-2 rounded-lg">
      <strong>This is a form</strong>
      <input type="text" input placeholder="Enter text"/>
      <select input>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>t
        <option value="3">Option 3</option>
      </select>
    </div>
  </div>    
</template>