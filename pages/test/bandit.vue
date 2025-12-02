<script lang="ts" setup>

const exampleTrial = {
    horizon: 20,
    arms: [
        {
            transition: [
                [ 0.0, 1.0 ],
                [ 1.0, 0.0 ]
            ],
            reward: [ 1.0, 0.0 ],
            initial: [ 0.0, 1.0 ]
        },
        {
            transition: [
                [ 1.0, 0.0 ],
                [ 0.0, 1.0 ]
            ],
            reward: [ 0.0, 1.0 ],
            initial: [ 1.0, 0.0 ]
        }
    ]
}

</script>

<template>
<div>
  <div p4 px10>
    <Reward :value="3"/>
    <Reward :value="1"/>
    <Reward :value="5"/>
    <br>
    <Reward :value="0"/>
    <Reward :value="-3"/>
    <Reward :value="0"/>
  </div>
  <div w800px mx-auto p4 mt-4 relative>
    <Bandit ref="bandit" v-bind="exampleTrial" />
  </div>
</div>
</template>

<style>

</style>